# Ozellar Training Project Rules

1. **Development Flow**: All regular development should happen on the `dev` branch. The `main` branch is reserved for production releases only.
2. **Auto-Testing on New Features**: Whenever a new feature or endpoint is added or modified, you MUST automatically write comprehensive tests for that feature without waiting for explicit instruction. Make sure existing functionality is not lost and existing tests continue to pass.
   - For backend changes, add tests in the `backend/` directory using pytest.
   - For frontend changes, update or add tests in the `frontend/tests/` directory.
