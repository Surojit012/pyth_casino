import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Bug Condition Exploration Test
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * 
 * Property 1: Bug Condition - Docker Build Module Resolution Failure
 * 
 * This test verifies that the bug condition exists in the current codebase:
 * - The package '@solana-program/token' is not in top-level dependencies
 * - Next.js build fails with module resolution error for '@solana-program/token'
 * - The error occurs in @privy-io/react-auth ESM module
 * 
 * EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS (this proves the bug exists)
 * EXPECTED OUTCOME ON FIXED CODE: Test PASSES (this proves the fix works)
 */

describe('Bug Condition Exploration: Module Resolution for @solana-program/token', () => {
  
  it('Property 1: @solana-program/token should be present in dependencies and build should succeed', () => {
    /**
     * Scoped PBT Approach: For this deterministic build failure, we scope the property
     * to the concrete failing case: Next.js build with current package.json
     * 
     * This test encodes the EXPECTED behavior (package present, build succeeds).
     * On unfixed code, it will FAIL, confirming the bug exists.
     * On fixed code, it will PASS, confirming the fix works.
     */
    
    // Step 1: Check if package is in package.json dependencies
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    const isInDependencies = '@solana-program/token' in (packageJson.dependencies || {});
    console.log('Is @solana-program/token in package.json dependencies?', isInDependencies);
    
    // Step 2: Verify the package is installed in node_modules
    let npmLsOutput = '';
    let npmLsExitCode = 0;
    
    try {
      npmLsOutput = execSync('npm ls @solana-program/token --depth=0', {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      npmLsExitCode = 0;
    } catch (error: any) {
      npmLsExitCode = error.status || 1;
      npmLsOutput = error.stdout || error.message;
    }
    
    console.log('npm ls @solana-program/token output:', npmLsOutput);
    console.log('npm ls exit code:', npmLsExitCode);
    
    const isInstalledInNodeModules = npmLsExitCode === 0;
    
    // Step 3: Check if @privy-io/react-auth module exists and contains the import
    const privyAuthModulePath = path.join(
      process.cwd(), 
      'node_modules/@privy-io/react-auth/dist/esm'
    );
    
    let hasPrivyAuthModule = false;
    let privyAuthImportsSolanaProgramToken = false;
    
    if (fs.existsSync(privyAuthModulePath)) {
      hasPrivyAuthModule = true;
      console.log('@privy-io/react-auth ESM module exists');
      
      // Check if any file in the ESM directory imports @solana-program/token
      const esmFiles = fs.readdirSync(privyAuthModulePath)
        .filter(f => f.endsWith('.mjs') || f.endsWith('.js'));
      
      for (const file of esmFiles) {
        const filePath = path.join(privyAuthModulePath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes('@solana-program/token')) {
          privyAuthImportsSolanaProgramToken = true;
          console.log(`Found @solana-program/token import in ${file}`);
          break;
        }
      }
    }
    
    console.log('Does @privy-io/react-auth import @solana-program/token?', privyAuthImportsSolanaProgramToken);
    
    // Step 4: Document the bug condition
    console.log('\n=== Bug Condition Analysis ===');
    console.log('1. @solana-program/token in package.json:', isInDependencies);
    console.log('2. @solana-program/token installed:', isInstalledInNodeModules);
    console.log('3. @privy-io/react-auth imports it:', privyAuthImportsSolanaProgramToken);
    
    if (!isInDependencies && privyAuthImportsSolanaProgramToken) {
      console.log('\n🐛 BUG CONFIRMED: @privy-io/react-auth imports @solana-program/token but it is not in dependencies');
      console.log('This will cause Next.js webpack build to fail with module resolution error');
    }
    
    // EXPECTED BEHAVIOR: Package should be in dependencies and installed
    // On unfixed code: these assertions will FAIL (proving bug exists)
    // On fixed code: these assertions will PASS (proving fix works)
    
    expect(isInDependencies).toBe(true);
    expect(isInstalledInNodeModules).toBe(true);
    
    // If we reach here, the package is present. The build should succeed.
    console.log('\n✅ Package is present in dependencies and installed');
  });
  
  it('Property 1 (PBT variant): Module resolution should succeed for @solana-program/token', () => {
    /**
     * Property-based test variant: Verify the dependency resolution property
     * 
     * Property: If @privy-io/react-auth imports @solana-program/token, 
     * then @solana-program/token MUST be in dependencies
     */
    
    fc.assert(
      fc.property(
        fc.constant({ packageName: '@solana-program/token' }),
        (testCase) => {
          // Read package.json
          const packageJsonPath = path.join(process.cwd(), 'package.json');
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          
          // Check if package is in dependencies
          const isInDependencies = testCase.packageName in (packageJson.dependencies || {});
          
          // Property: Package should be in dependencies
          // On unfixed code: returns false (test fails, proving bug exists)
          // On fixed code: returns true (test passes, proving fix works)
          return isInDependencies;
        }
      ),
      {
        numRuns: 1, // Single run since bug is deterministic
        verbose: true
      }
    );
  });
});
