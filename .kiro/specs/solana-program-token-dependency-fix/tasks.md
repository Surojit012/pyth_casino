# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Docker Build Module Resolution Failure
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For this deterministic build failure, scope the property to the concrete failing case: Docker build with current package.json
  - Test that Docker build (`docker build .`) fails with "Module not found: Can't resolve '@solana-program/token'" error
  - Test that the error occurs in ./node_modules/@privy-io/react-auth/dist/esm/FundSolWalletWithExternalSolanaWallet-Cy3gO2rc.mjs
  - Test that `npm ls @solana-program/token` shows the package is not in top-level dependencies
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Solana Functionality Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (development server, existing wallet operations)
  - Test that `npm run dev` starts successfully on unfixed code
  - Test that existing @solana/web3.js wallet connections work on unfixed code
  - Test that @solana/spl-token operations function correctly on unfixed code
  - Test that @solana/wallet-adapter-* integrations remain operational on unfixed code
  - Test that other @privy-io/react-auth features (authentication, wallet management) work on unfixed code
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for missing @solana-program/token dependency

  - [x] 3.1 Add @solana-program/token to package.json dependencies
    - Add "@solana-program/token": "^0.9.0" to the dependencies section
    - Place after existing @solana/* packages for logical grouping
    - Version ^0.9.0 satisfies @privy-io/react-auth peer dependency requirement (>=0.6.0)
    - Version matches existing transitive dependency in package-lock.json
    - Run `npm install` to update package-lock.json
    - Verify @solana-program/token appears in node_modules
    - _Bug_Condition: isBugCondition(buildContext) where buildContext.command == "npm run build" AND "@solana-program/token" NOT IN buildContext.installedPackages_
    - _Expected_Behavior: Docker build successfully resolves '@solana-program/token' and completes without module resolution errors (Requirements 2.1, 2.2, 2.3)_
    - _Preservation: Existing Solana dependencies (@solana/web3.js, @solana/spl-token, wallet adapters) continue to resolve correctly; application runtime behavior remains identical (Requirements 3.1, 3.2, 3.3, 3.4)_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Docker Build Module Resolution Success
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - Verify Docker build completes successfully without module resolution errors
    - Verify webpack can resolve '@solana-program/token' during bundling
    - Verify deployable container image is created
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Solana Functionality Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - Verify `npm run dev` still starts successfully
    - Verify existing wallet connections still work
    - Verify token operations still function correctly
    - Verify wallet adapters still work
    - Verify Privy authentication features still work
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
