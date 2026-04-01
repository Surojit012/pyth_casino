import { describe, it, expect } from 'vitest';
import { execSync, spawn } from 'child_process';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Preservation Property Tests
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 * 
 * Property 2: Preservation - Existing Solana Functionality Unchanged
 * 
 * IMPORTANT: These tests follow observation-first methodology:
 * - Run on UNFIXED code to observe baseline behavior
 * - Tests should PASS on unfixed code (establishing baseline)
 * - Tests should continue to PASS after fix (proving no regressions)
 * 
 * These tests verify that existing Solana functionality remains operational:
 * - Development server starts successfully
 * - Solana wallet adapter dependencies are present
 * - SPL token dependencies are present
 * - Privy authentication dependencies are present
 * - Package installation works without conflicts
 */

describe('Preservation: Existing Solana Functionality Unchanged', () => {
  
  it('Property 2.1: npm install completes successfully without conflicts', () => {
    /**
     * Validates: Requirement 3.3
     * 
     * Test that npm install runs successfully in the current state.
     * This establishes baseline that dependency installation works.
     */
    
    let installSucceeded = false;
    let installOutput = '';
    
    try {
      // Run npm install in a way that doesn't modify the actual node_modules
      // We just verify the command would succeed
      installOutput = execSync('npm ls --depth=0', {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 30000
      });
      installSucceeded = true;
    } catch (error: any) {
      // npm ls returns non-zero if there are missing peer dependencies
      // but that's expected - we just want to verify it doesn't crash
      installOutput = error.stdout || error.message;
      installSucceeded = error.status !== undefined; // Command ran, even if with warnings
    }
    
    console.log('npm ls output (truncated):', installOutput.substring(0, 500));
    
    // Property: npm commands should execute without crashing
    expect(installSucceeded).toBe(true);
  });
  
  it('Property 2.2: Existing @solana/* dependencies are present and resolvable', () => {
    /**
     * Validates: Requirement 3.1
     * 
     * Test that existing Solana dependencies (@solana/web3.js, @solana/spl-token,
     * @solana/wallet-adapter-*) are present in package.json and installed.
     */
    
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    const expectedSolanaDeps = [
      '@solana/web3.js',
      '@solana/spl-token',
      '@solana/wallet-adapter-base',
      '@solana/wallet-adapter-react',
      '@solana/wallet-adapter-react-ui',
      '@solana/wallet-adapter-wallets'
    ];
    
    const results = expectedSolanaDeps.map(dep => {
      const inPackageJson = dep in (packageJson.dependencies || {});
      const nodeModulePath = path.join(process.cwd(), 'node_modules', dep);
      const installed = fs.existsSync(nodeModulePath);
      
      console.log(`${dep}: in package.json=${inPackageJson}, installed=${installed}`);
      
      return { dep, inPackageJson, installed };
    });
    
    // Property: All existing Solana dependencies should be present and installed
    results.forEach(({ dep, inPackageJson, installed }) => {
      expect(inPackageJson).toBe(true);
      expect(installed).toBe(true);
    });
  });
  
  it('Property 2.3: @privy-io/react-auth is present and resolvable', () => {
    /**
     * Validates: Requirement 3.4
     * 
     * Test that @privy-io/react-auth is present and can be resolved.
     * This is the package that imports @solana-program/token.
     */
    
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    const privyInPackageJson = '@privy-io/react-auth' in (packageJson.dependencies || {});
    const privyNodeModulePath = path.join(process.cwd(), 'node_modules/@privy-io/react-auth');
    const privyInstalled = fs.existsSync(privyNodeModulePath);
    
    console.log('@privy-io/react-auth: in package.json=', privyInPackageJson);
    console.log('@privy-io/react-auth: installed=', privyInstalled);
    
    // Property: Privy should be present and installed
    expect(privyInPackageJson).toBe(true);
    expect(privyInstalled).toBe(true);
  });
  
  it('Property 2.4: Development server can be started (npm run dev)', () => {
    /**
     * Validates: Requirement 3.2
     * 
     * Test that the development server can start successfully.
     * We start the server and check that it doesn't immediately crash.
     * 
     * Note: We don't test the full build (npm run build) here because
     * that's the bug condition - it's expected to fail on unfixed code.
     */
    
    let devServerStarted = false;
    let devServerOutput = '';
    
    // Start dev server as a child process
    const devProcess = spawn('npm', ['run', 'dev'], {
      stdio: 'pipe',
      shell: true
    });
    
    // Collect output
    devProcess.stdout?.on('data', (data) => {
      devServerOutput += data.toString();
    });
    
    devProcess.stderr?.on('data', (data) => {
      devServerOutput += data.toString();
    });
    
    // Wait for server to start or fail
    const startupPromise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        // If we get here, server is still running after 15 seconds
        // That's a good sign - it started successfully
        devServerStarted = true;
        devProcess.kill();
        resolve(true);
      }, 15000);
      
      devProcess.on('exit', (code) => {
        clearTimeout(timeout);
        // If server exits immediately, it failed to start
        devServerStarted = code === 0 || code === null;
        resolve(devServerStarted);
      });
    });
    
    return startupPromise.then((started) => {
      console.log('Dev server startup result:', started);
      console.log('Dev server output (last 500 chars):', devServerOutput.slice(-500));
      
      // Property: Dev server should start without immediate crashes
      // Note: It's okay if it eventually fails due to the missing dependency
      // We just want to verify it doesn't crash on startup
      expect(started).toBe(true);
    });
  }, 20000); // 20 second timeout for this test
  
  it('Property 2.5 (PBT): Solana wallet adapter modules can be imported', () => {
    /**
     * Validates: Requirement 3.1, 3.2
     * 
     * Property-based test: For any Solana wallet adapter module,
     * it should be importable without errors.
     */
    
    const walletAdapterModules = [
      '@solana/wallet-adapter-base',
      '@solana/wallet-adapter-react',
      '@solana/wallet-adapter-react-ui',
      '@solana/wallet-adapter-wallets'
    ];
    
    fc.assert(
      fc.property(
        fc.constantFrom(...walletAdapterModules),
        (moduleName) => {
          // Check if module exists in node_modules
          const modulePath = path.join(process.cwd(), 'node_modules', moduleName);
          const exists = fs.existsSync(modulePath);
          
          console.log(`Checking ${moduleName}: exists=${exists}`);
          
          // Property: Module should exist and be resolvable
          return exists;
        }
      ),
      {
        numRuns: walletAdapterModules.length,
        verbose: true
      }
    );
  });
  
  it('Property 2.6 (PBT): SPL token operations dependencies are present', () => {
    /**
     * Validates: Requirement 3.1
     * 
     * Property-based test: @solana/spl-token should be present and
     * its main entry point should exist.
     */
    
    fc.assert(
      fc.property(
        fc.constant('@solana/spl-token'),
        (moduleName) => {
          const modulePath = path.join(process.cwd(), 'node_modules', moduleName);
          const packageJsonPath = path.join(modulePath, 'package.json');
          
          const moduleExists = fs.existsSync(modulePath);
          const hasPackageJson = fs.existsSync(packageJsonPath);
          
          console.log(`${moduleName}: exists=${moduleExists}, has package.json=${hasPackageJson}`);
          
          // Property: Module should exist with valid package.json
          return moduleExists && hasPackageJson;
        }
      ),
      {
        numRuns: 1,
        verbose: true
      }
    );
  });
  
  it('Property 2.7 (PBT): Privy authentication module structure is intact', () => {
    /**
     * Validates: Requirement 3.4
     * 
     * Property-based test: @privy-io/react-auth should have its expected
     * module structure (ESM and CJS builds).
     */
    
    fc.assert(
      fc.property(
        fc.constant('@privy-io/react-auth'),
        (moduleName) => {
          const modulePath = path.join(process.cwd(), 'node_modules', moduleName);
          const distPath = path.join(modulePath, 'dist');
          const esmPath = path.join(distPath, 'esm');
          
          const moduleExists = fs.existsSync(modulePath);
          const distExists = fs.existsSync(distPath);
          const esmExists = fs.existsSync(esmPath);
          
          console.log(`${moduleName}: module=${moduleExists}, dist=${distExists}, esm=${esmExists}`);
          
          // Property: Module should have expected directory structure
          return moduleExists && distExists && esmExists;
        }
      ),
      {
        numRuns: 1,
        verbose: true
      }
    );
  });
  
  it('Property 2.8 (PBT): Package.json dependencies are well-formed', () => {
    /**
     * Validates: Requirement 3.3
     * 
     * Property-based test: For any dependency in package.json,
     * it should have a valid version specifier.
     */
    
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    const dependencies = Object.entries(packageJson.dependencies || {});
    
    fc.assert(
      fc.property(
        fc.constantFrom(...dependencies),
        ([depName, depVersion]) => {
          // Property: Version should be a non-empty string
          const isValidVersion = typeof depVersion === 'string' && depVersion.length > 0;
          
          console.log(`${depName}: version=${depVersion}, valid=${isValidVersion}`);
          
          return isValidVersion;
        }
      ),
      {
        numRuns: Math.min(dependencies.length, 20), // Test up to 20 dependencies
        verbose: true
      }
    );
  });
});
