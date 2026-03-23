# Документ требований: Security Hardening

## Введение

Укрепление безопасности проекта OpenClaw по трём направлениям: валидация Origin при WebSocket upgrade, sandbox-профиль Docker Compose с seccomp, и Python-скрипт валидации входных данных (энтропия Шеннона + детекция prompt injection). Все изменения минимальны, переиспользуют существующую инфраструктуру безопасности (`csrf.ts`, `external-content.ts`, `net.ts`) и не нарушают текущую логику.

## Глоссарий

- **Gateway**: HTTP/WebSocket сервер OpenClaw (`src/gateway/`)
- **Canvas_Host**: Сервер статических файлов с live-reload WebSocket (`src/canvas-host/server.ts`)
- **WS_Upgrade_Handler**: Обработчик HTTP Upgrade → WebSocket в `Canvas_Host.handleUpgrade`
- **Origin_Validator**: Модуль валидации заголовка Origin при WebSocket upgrade
- **CSRF_Guard**: Существующий middleware защиты от CSRF (`src/browser/csrf.ts`)
- **Loopback_Address**: Адреса 127.0.0.0/8, ::1, localhost
- **Sandbox_Profile**: Docker Compose профиль для изолированного выполнения контейнеров
- **Seccomp_Profile**: JSON-файл политики seccomp для ограничения системных вызовов
- **Input_Validator**: Python-скрипт валидации JSON Lines из stdin
- **Shannon_Entropy**: Информационная энтропия строки H = -Σ p(x) log₂ p(x)
- **Prompt_Injection**: Атака внедрения инструкций в LLM через пользовательский ввод
- **Capability_Token**: Параметр `oc_cap` в query string WebSocket URL для авторизации

## Требования

### Требование 1: Валидация Origin при WebSocket Upgrade

**User Story:** Как оператор Gateway, я хочу чтобы WebSocket upgrade запросы к Canvas Host проверяли заголовок Origin, чтобы предотвратить cross-origin WebSocket hijacking (CSWSH).

#### Критерии приёмки

1. WHEN an HTTP Upgrade request to `/__openclaw__/ws` contains an Origin header, THE Origin_Validator SHALL accept the connection only if the Origin hostname resolves to a Loopback_Address via the existing `isLoopbackHost()` function from `src/gateway/net.ts`
2. WHEN an HTTP Upgrade request to `/__openclaw__/ws` lacks an Origin header, THE Origin_Validator SHALL reject the connection by destroying the socket with no response
3. WHEN an HTTP Upgrade request to `/__openclaw__/ws` contains an Origin header with a non-loopback hostname, THE Origin_Validator SHALL reject the connection by destroying the socket with no response
4. WHEN an HTTP Upgrade request to `/__openclaw__/ws` contains an Origin header with value "null", THE Origin_Validator SHALL reject the connection by destroying the socket with no response
5. THE Origin_Validator SHALL be implemented as a pure function `isAllowedWebSocketOrigin(origin: string | undefined): boolean` in a dedicated module `src/canvas-host/ws-origin.ts`, reusing `isLoopbackHost` from `src/gateway/net.ts`
6. THE Canvas_Host SHALL invoke Origin_Validator before calling `wss.handleUpgrade` in the existing `handleUpgrade` method of `src/canvas-host/server.ts`
7. WHILE the environment variable `OPENCLAW_SKIP_WS_ORIGIN_CHECK` is set to a truthy value, THE Origin_Validator SHALL accept all connections regardless of Origin header (break-glass escape hatch for development)

### Требование 2: Sandbox Docker Compose профиль с Seccomp

**User Story:** Как DevOps-инженер, я хочу иметь Docker Compose профиль для запуска контейнеров в максимально изолированной среде, чтобы минимизировать поверхность атаки при выполнении недоверенного кода.

#### Критерии приёмки

1. THE Sandbox_Profile SHALL be defined as a new service `openclaw-sandbox` in `docker-compose.yml` with `network_mode: "none"` to disable all network access
2. THE Sandbox_Profile SHALL run as user `65534:65534` (nobody:nogroup) to enforce least-privilege execution
3. THE Sandbox_Profile SHALL mount the root filesystem as read-only via `read_only: true`
4. THE Sandbox_Profile SHALL drop all Linux capabilities via `cap_drop: [ALL]`
5. THE Sandbox_Profile SHALL apply `no-new-privileges:true` via `security_opt`
6. THE Sandbox_Profile SHALL reference a custom Seccomp_Profile at `docker/seccomp-sandbox.json`
7. THE Seccomp_Profile SHALL use a default action of `SCMP_ACT_ERRNO` and whitelist only the minimal set of syscalls required for Node.js runtime operation (read, write, open, close, stat, fstat, mmap, mprotect, munmap, brk, ioctl, access, pipe, select, sched_yield, clone, execve, exit, exit_group, futex, epoll_create, epoll_ctl, epoll_wait, socket, connect, sendto, recvfrom, getpid, getuid, getgid, gettid, rt_sigaction, rt_sigprocmask, clock_gettime, nanosleep, getrandom, and their equivalents)
8. THE Sandbox_Profile SHALL provide a writable `/tmp` via `tmpfs` mount with `size=64m` and `noexec` option
9. THE Sandbox_Profile SHALL inherit the base image from the existing `openclaw-gateway` service via `image: ${OPENCLAW_IMAGE:-openclaw:local}`

### Требование 3: Python-скрипт валидации входных данных

**User Story:** Как разработчик, я хочу иметь Python-скрипт для валидации текстовых входных данных из stdin, чтобы обнаруживать потенциальные prompt injection атаки и аномально высокую энтропию (признак обфускации).

#### Критерии приёмки

1. THE Input_Validator SHALL read JSON Lines from stdin, where each line is a JSON object with a required `"text"` field of type string
2. WHEN a JSON line contains a `"text"` field with Shannon_Entropy exceeding 4.5 bits per character, THE Input_Validator SHALL flag the line with `"high_entropy": true` in the output
3. WHEN a JSON line contains a `"text"` field matching one or more prompt injection patterns, THE Input_Validator SHALL flag the line with `"injection_patterns": [<matched_pattern_names>]` in the output
4. THE Input_Validator SHALL use prompt injection detection patterns consistent with those defined in `src/security/external-content.ts` (SUSPICIOUS_PATTERNS array), translated to Python `re` module syntax
5. FOR ALL valid JSON Lines input, THE Input_Validator SHALL produce exactly one JSON Line of output per input line, preserving the original `"text"` field and adding validation metadata fields (`"high_entropy"`, `"entropy"`, `"injection_patterns"`, `"valid"`)
6. IF a line from stdin is not valid JSON or lacks a `"text"` field, THEN THE Input_Validator SHALL output a JSON line with `"error": "invalid_input"` and `"line"` containing the raw input (truncated to 200 characters)
7. THE Input_Validator SHALL be located at `scripts/validate-input.py` and require only Python 3.8+ standard library (no external dependencies)
8. THE Input_Validator SHALL exit with code 0 on success and code 1 if any input line was flagged as containing injection patterns
9. FOR ALL valid text inputs, computing Shannon_Entropy then formatting the result to 4 decimal places then re-parsing SHALL produce the same numeric value (round-trip property of entropy computation)
