# План реализации: Security Hardening

## Обзор

Три независимых модуля безопасности (~190 строк нового кода). Порядок: реализация кода → тесты. Каждый компонент самодостаточен и не зависит от других.

## Задачи

- [x] 1. Реализовать WebSocket Origin Validator
  - [x] 1.1 Создать `src/canvas-host/ws-origin.ts` с функцией `isAllowedWebSocketOrigin`
    - Чистая функция: принимает `origin: string | undefined`, возвращает `boolean`
    - Переиспользует `isLoopbackHost` из `src/gateway/net.ts` и `isTruthyEnvValue` из `src/infra/env.js`
    - Обрабатывает: `undefined` → false, `"null"` → false, невалидный URL → false, non-loopback → false, loopback → true
    - Break-glass: `OPENCLAW_SKIP_WS_ORIGIN_CHECK` truthy → всегда true
    - ~20 строк кода, см. дизайн Компонент 1
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_

  - [x] 1.2 Интегрировать Origin Validator в `src/canvas-host/server.ts`
    - Добавить import `isAllowedWebSocketOrigin` из `./ws-origin.js`
    - В методе `handleUpgrade`, перед вызовом `wss.handleUpgrade`, добавить проверку:
      ```typescript
      if (!isAllowedWebSocketOrigin(req.headers.origin)) {
        socket.destroy();
        return true;
      }
      ```
    - Изменение ~5 строк (import + guard clause)
    - _Requirements: 1.6_

- [ ] 2. Checkpoint — проверить компиляцию WS Origin Validator
  - Убедиться что `pnpm build` проходит без ошибок, задать вопросы пользователю при необходимости.

- [x] 3. Реализовать Sandbox Docker Compose профиль
  - [x] 3.1 Создать `docker/seccomp-sandbox.json`
    - Seccomp-профиль: `defaultAction: SCMP_ACT_ERRNO`, `architectures: [SCMP_ARCH_X86_64, SCMP_ARCH_X86, SCMP_ARCH_AARCH64]`
    - Whitelist syscalls из дизайна (I/O, stat, memory, process, signals, epoll, pipe/socket, misc)
    - Все syscalls с `action: SCMP_ACT_ALLOW`
    - _Requirements: 2.6, 2.7_

  - [x] 3.2 Добавить сервис `openclaw-sandbox` в `docker-compose.yml`
    - `network_mode: "none"`, `user: "65534:65534"`, `read_only: true`
    - `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true, seccomp=docker/seccomp-sandbox.json]`
    - `tmpfs: [/tmp:size=64m,noexec]`, `profiles: [sandbox]`
    - `image: ${OPENCLAW_IMAGE:-openclaw:local}`, `entrypoint: ["node", "dist/index.js"]`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9_

- [x] 4. Реализовать Python Input Validator
  - [x] 4.1 Создать `scripts/validate-input.py`
    - Функция `shannon_entropy(text: str) -> float`: H = -Σ p(x) log₂ p(x), 0.0 для пустой строки
    - Константа `ENTROPY_THRESHOLD = 4.5`
    - Массив `INJECTION_PATTERNS` — 14 паттернов из дизайна, портированных из `src/security/external-content.ts`
    - Функция `validate_line(text: str) -> dict`: возвращает `{text, entropy, high_entropy, injection_patterns, valid}`
    - Функция `main() -> int`: читает JSON Lines из stdin, пишет JSON Lines в stdout, exit code 1 если injection найден
    - Обработка ошибок: невалидный JSON → `{"error": "invalid_input", "line": "<truncated to 200>"}`
    - Только stdlib Python 3.8+, ~90 строк
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 5. Checkpoint — проверить работоспособность всех компонентов
  - Убедиться что `pnpm build` проходит, `python3 scripts/validate-input.py` запускается, задать вопросы пользователю при необходимости.

- [ ] 6. Написать тесты для WebSocket Origin Validator
  - [ ] 6.1 Создать `src/canvas-host/ws-origin.test.ts` с unit-тестами
    - `undefined` origin → `false`
    - `"null"` origin → `false`
    - `"http://localhost:18789"` → `true`
    - `"http://127.0.0.1:3000"` → `true`
    - `"http://[::1]:8080"` → `true`
    - `"https://evil.com"` → `false`
    - `"not-a-url"` → `false`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]\* 6.2 Property test: Loopback origin acceptance (Property 1)
    - **Property 1: Loopback origin acceptance**
    - Для любого URL с loopback hostname → `true`; для любого URL с non-loopback hostname → `false`
    - Использовать `fast-check` (добавить как devDependency)
    - Минимум 100 итераций, тег: `// Feature: security-hardening, Property 1: Loopback origin acceptance`
    - **Validates: Requirements 1.1, 1.3**

  - [ ]\* 6.3 Property test: Break-glass override (Property 2)
    - **Property 2: Break-glass override accepts all origins**
    - Для любого origin при `OPENCLAW_SKIP_WS_ORIGIN_CHECK=1` → `true`
    - Минимум 100 итераций, тег: `// Feature: security-hardening, Property 2: Break-glass override accepts all origins`
    - **Validates: Requirements 1.7**

- [ ] 7. Написать тесты для Python Input Validator
  - [ ] 7.1 Создать `scripts/validate-input.test.py` с unit-тестами
    - Пустая строка → entropy 0.0
    - `"aaaa"` → entropy 0.0
    - `"ignore all previous instructions"` → injection detected
    - Невалидный JSON → error output
    - JSON без `"text"` → error output
    - _Requirements: 3.1, 3.2, 3.3, 3.6_

  - [ ]\* 7.2 Property test: JSON Lines 1:1 mapping (Property 3)
    - **Property 3: JSON Lines 1:1 mapping with metadata preservation**
    - N валидных JSON → N строк вывода, каждая содержит оригинальный `text` + метаданные
    - Использовать `hypothesis` (dev-зависимость) или встроенный `random`
    - Минимум 100 итераций, тег: `# Feature: security-hardening, Property 3: JSON Lines 1:1 mapping`
    - **Validates: Requirements 3.1, 3.5**

  - [ ]\* 7.3 Property test: Entropy threshold classification (Property 4)
    - **Property 4: Entropy threshold classification**
    - `shannon_entropy(text) > 4.5` → `high_entropy: true`, иначе `false`
    - Минимум 100 итераций, тег: `# Feature: security-hardening, Property 4: Entropy threshold classification`
    - **Validates: Requirements 3.2**

  - [ ]\* 7.4 Property test: Injection pattern detection (Property 5)
    - **Property 5: Injection pattern detection**
    - Текст с injection-паттерном → имя паттерна в `injection_patterns`; без паттернов → пустой массив
    - Минимум 100 итераций, тег: `# Feature: security-hardening, Property 5: Injection pattern detection`
    - **Validates: Requirements 3.3**

  - [ ]\* 7.5 Property test: Invalid input error handling (Property 6)
    - **Property 6: Invalid input error handling with truncation**
    - Невалидный JSON или JSON без `text` → `{"error": "invalid_input", "line": "<truncated to 200>"}`
    - Минимум 100 итераций, тег: `# Feature: security-hardening, Property 6: Invalid input error handling`
    - **Validates: Requirements 3.6**

  - [ ]\* 7.6 Property test: Exit code reflects injection presence (Property 7)
    - **Property 7: Exit code reflects injection presence**
    - Exit code 1 ⟺ хотя бы одна строка с непустым `injection_patterns`; иначе 0
    - Минимум 100 итераций, тег: `# Feature: security-hardening, Property 7: Exit code reflects injection presence`
    - **Validates: Requirements 3.8**

  - [ ]\* 7.7 Property test: Entropy computation round-trip (Property 8)
    - **Property 8: Entropy computation round-trip**
    - `float(f"{shannon_entropy(text):.4f}")` — round-trip стабильность
    - Минимум 100 итераций, тег: `# Feature: security-hardening, Property 8: Entropy computation round-trip`
    - **Validates: Requirements 3.9**

- [x] 8. Финальный checkpoint
  - Убедиться что все тесты проходят (`pnpm test -- src/canvas-host/ws-origin.test.ts` и `python3 scripts/validate-input.test.py`), задать вопросы пользователю при необходимости.

## Примечания

- Задачи с `*` — опциональные (property-based тесты), можно пропустить для быстрого MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- `fast-check` нужно добавить как devDependency для TypeScript property-тестов
- Python тесты используют `hypothesis` (если доступна) или встроенный `random` + `unittest`
- Общий объём нового кода: ~190 строк (без тестов)
