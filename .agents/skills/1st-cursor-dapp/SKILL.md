```markdown
# 1st-cursor-dapp Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `1st-cursor-dapp` repository, a JavaScript project built with the Express framework. It covers file and code organization, commit message habits, and testing patterns to help you contribute effectively and maintain consistency across the codebase.

## Coding Conventions

### File Naming
- Use **camelCase** for all file names.
  - Example: `userController.js`, `apiRoutes.js`

### Import Style
- Use **relative imports** for modules within the project.
  - Example:
    ```javascript
    import { getUser } from './userService';
    ```

### Export Style
- Use **named exports** for functions, objects, or constants.
  - Example:
    ```javascript
    // userService.js
    export function getUser(id) { ... }
    export const USER_ROLE = 'admin';
    ```

### Commit Messages
- Freeform style, sometimes with prefixes.
- Average commit message length: ~34 characters.
  - Example: `add user authentication middleware`

## Workflows

### Adding a New Feature
**Trigger:** When implementing a new feature or endpoint  
**Command:** `/add-feature`

1. Create a new file using camelCase naming.
2. Write your feature logic using named exports.
3. Import dependencies using relative paths.
4. Add or update relevant Express routes.
5. Write corresponding tests in a `.test.js` file.
6. Commit your changes with a clear, concise message.

### Fixing a Bug
**Trigger:** When resolving a bug or issue  
**Command:** `/fix-bug`

1. Locate the problematic code.
2. Apply the fix, following code style conventions.
3. Update or add tests to cover the bug fix.
4. Commit with a descriptive message (e.g., `fix login redirect issue`).

### Writing Tests
**Trigger:** When adding or updating tests  
**Command:** `/write-test`

1. Create or update a test file matching `*.test.js`.
2. Write test cases for the relevant functionality.
3. Ensure tests are clear and cover edge cases.
4. Run the test suite to verify correctness.

## Testing Patterns

- Test files follow the `*.test.js` naming convention.
- The testing framework is **unknown** (check the repository for details).
- Place tests alongside or near the code they cover.
- Example test file name: `userService.test.js`

## Commands
| Command      | Purpose                                 |
|--------------|-----------------------------------------|
| /add-feature | Steps to add a new feature or endpoint  |
| /fix-bug     | Steps to fix a bug or issue             |
| /write-test  | Steps to add or update tests            |
```
