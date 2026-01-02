import apiClient from './client';
import type {
  AppSpec,
  ValidationResult,
  PriceResult,
  RegisterResult,
  DeploymentInfo,
} from '../types/app-spec';

/**
 * Verify app registration specifications
 */
export async function verifyAppSpecifications(
  spec: AppSpec
): Promise<ValidationResult> {
  console.log('[API] Verifying app spec:', spec);
  // NOTE: FluxOS requires the body to be a stringified JSON string, NOT a JSON object
  const response = await apiClient.post<ValidationResult>(
    '/apps/verifyappregistrationspecifications',
    JSON.stringify(spec), 
    { 
      timeout: 60000,
      headers: {
        'Content-Type': 'text/plain' // Ensure it's treated as text/plain or application/json but as a string body
      }
    }
  );

  return response.data;
}

/**
 * Calculate app price in USD and FLUX
 */
export async function calculatePrice(spec: AppSpec): Promise<PriceResult> {
  console.log('[API] Calculating price for spec:', spec);
  // NOTE: FluxOS requires the body to be a stringified JSON string, NOT a JSON object
  const response = await apiClient.post<PriceResult>(
    '/apps/calculatefiatandfluxprice',
    JSON.stringify(spec),
    { 
      timeout: 60000,
      headers: {
        'Content-Type': 'text/plain'
      }
    }
  );

  return response.data;
}

/**
 * Register a new app
 */
export async function registerApp(
  zelidauth: string,
  data: {
    appSpecifications: AppSpec;
    timestamp: number;
    signature: string;
    type: string;
    version: number;
  }
): Promise<RegisterResult> {
  console.log('[API] Registering app:', data);
  // NOTE: FluxOS requires the body to be a stringified JSON string, NOT a JSON object
  const response = await apiClient.post<RegisterResult>(
    '/apps/appregister',
    JSON.stringify(data),
    {
      headers: {
        zelidauth,
        'Content-Type': 'text/plain'
      },
      timeout: 60000
    }
  );

  return response.data;
}

/**
 * Test app installation
 */
export async function testAppInstall(
  zelidauth: string,
  hash: string
): Promise<string> {
  const response = await apiClient.get<{ status: string; data: string }>(
    `/apps/testappinstall/${hash}`,
    {
      headers: {
        zelidauth,
      },
    }
  );

  return response.data.data;
}

/**
 * Get deployment information (payment address, etc.)
 */
export async function getDeploymentInfo(): Promise<DeploymentInfo> {
  const response = await apiClient.get<DeploymentInfo>(
    '/apps/deploymentinformation'
  );

  return response.data;
}

/**
 * Get registration information
 */
export async function getRegistrationInfo(): Promise<{
  status: string;
  data: {
    address: string;
    height: number;
  };
}> {
  const response = await apiClient.get('/apps/registrationinformation');
  return response.data;
}

/**
 * Check if Docker image exists
 */
export async function checkDockerExists(
  zelidauth: string,
  repotag: string
): Promise<boolean> {
  try {
    const response = await apiClient.post<{ status: string; data: boolean }>(
      '/apps/checkdockerexistance',
      JSON.stringify({ repotag }),
      {
        headers: {
          zelidauth,
        },
      }
    );

    return response.data.status === 'success' && response.data.data === true;
  } catch {
    return false;
  }
}

/**
 * Get global app specifications (check if name is taken)
 */
export async function getGlobalAppSpecs(): Promise<{
  status: string;
  data: AppSpec[];
}> {
  const response = await apiClient.get('/apps/globalappsspecifications');
  return response.data;
}

/**
 * Check if app name is available
 */
export async function isAppNameAvailable(name: string): Promise<boolean> {
  try {
    const response = await getGlobalAppSpecs();
    if (response.status === 'success' && Array.isArray(response.data)) {
      const exists = response.data.some(
        (app) => app.name.toLowerCase() === name.toLowerCase()
      );
      return !exists;
    }
    return true; // Assume available if we can't check
  } catch {
    return true; // Assume available on error
  }
}
