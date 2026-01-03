'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/stores/auth';
import { verifyAppSpecifications, calculatePrice } from '@/lib/api/apps';
import { DEFAULT_EXPIRE_BLOCKS } from '@/lib/types/app-spec';
import type { RegistrationFormData, AppSpec, ComponentSpec } from '@/lib/types/app-spec';
import { useSignMessage } from 'wagmi';
import { signWithSSP } from '@/lib/wallet/ssp';
import { signWithZelcore } from '@/lib/wallet/zelcore';
import {
  ChevronLeft,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  DollarSign,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
} from 'lucide-react';

interface StepReviewProps {
  formData: RegistrationFormData;
  onBack: () => void;
  onSignatureComplete: (hash: string, signature: string) => void;
}

export function StepReview({ formData, onBack, onSignatureComplete }: StepReviewProps) {
  const { zelid, loginType } = useAuthStore();
  const { signMessageAsync } = useSignMessage();

  const [isValidating, setIsValidating] = useState(false);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const [validationResult, setValidationResult] = useState<'success' | 'error' | null>(null);
  const [validationMessage, setValidationMessage] = useState<string>('');
  const [priceUSD, setPriceUSD] = useState<number | null>(null);
  const [priceFlux, setPriceFlux] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build the app specification from form data
  const buildAppSpec = (): AppSpec => {
    const component: ComponentSpec = {
      name: formData.component.name || 'main',
      description: formData.component.description || formData.general.description,
      repotag: formData.component.repotag,
      ports: formData.component.ports.filter((p) => p.external > 0).map((p) => p.external),
      containerPorts: formData.component.ports.filter((p) => p.container > 0).map((p) => p.container),
      domains: formData.component.ports
        .filter((p) => p.external > 0)
        .map(() => ''), // Flux requires an empty string for each exposed port to allow domain generation
      environmentParameters: formData.component.environmentParameters
        .filter((e) => e.key && e.value)
        .map((e) => `${e.key}=${e.value}`),
      commands: formData.component.commands
        ? formData.component.commands.split(' ').filter(Boolean)
        : [],
      containerData: formData.component.containerData || '',
      cpu: formData.component.cpu,
      ram: formData.component.ram,
      hdd: formData.component.hdd,
      repoauth: '',
      tiered: false,
    };

    const spec: AppSpec = {
      version: 8,
      name: formData.general.name,
      description: formData.general.description,
      owner: zelid || '',
      contacts: formData.general.contactEmail ? [formData.general.contactEmail] : [],
      instances: formData.general.instances,
      staticip: false,
      enterprise: '',
      nodes: [],
      geolocation: [],
      expire: DEFAULT_EXPIRE_BLOCKS,
      compose: [component],
    };

    return spec;
  };

  const appSpec = buildAppSpec();

  // Validate and calculate price on mount
  useEffect(() => {
    const validateAndPrice = async () => {
      setIsValidating(true);
      setError(null);

      try {
        const result = await verifyAppSpecifications(appSpec);
        if (result.status === 'success') {
          setValidationResult('success');
          setValidationMessage('Specifications are valid');
        } else {
          setValidationResult('error');
          setValidationMessage(result.data?.message || 'Validation failed');
        }
      } catch (err) {
        setValidationResult('error');
        setValidationMessage(err instanceof Error ? err.message : 'Validation failed');
      } finally {
        setIsValidating(false);
      }

      // Calculate price
      setIsCalculatingPrice(true);
      try {
        const priceResult = await calculatePrice(appSpec);
        if (priceResult.status === 'success' && priceResult.data) {
          setPriceUSD(priceResult.data.priceUSD);
          setPriceFlux(priceResult.data.actualPriceFlux || priceResult.data.priceFlux);
        }
      } catch (err) {
        console.error('Price calculation error:', err);
      } finally {
        setIsCalculatingPrice(false);
      }
    };

    validateAndPrice();
  }, []);

  const handleSign = async () => {
    if (!zelid) {
      setError('Please connect your wallet first');
      return;
    }

    setIsSigning(true);
    setError(null);

    try {
      const timestamp = Date.now();
      const messageToSign = `fluxappregister${JSON.stringify(appSpec)}${timestamp}`;

      let signature: string;

      if (loginType === 'ssp') {
        const result = await signWithSSP(messageToSign);
        signature = result.signature;
      } else if (loginType === 'zelcore') {
        const result = await signWithZelcore(messageToSign, zelid);
        if (!result) {
          throw new Error('Zelcore signing cancelled');
        }
        signature = result.signature;
      } else {
        // MetaMask or WalletConnect
        signature = await signMessageAsync({ message: messageToSign });
      }

      // Create a hash for identification
      const hash = btoa(messageToSign).slice(0, 16);

      onSignatureComplete(hash, signature);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Review & Sign</h2>
        <p className="text-muted-foreground">
          Review your application specifications before deployment
        </p>
      </div>

      {/* Validation Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            {isValidating ? (
              <Loader2 className="size-5 animate-spin" />
            ) : validationResult === 'success' ? (
              <CheckCircle className="size-5 text-green-500" />
            ) : validationResult === 'error' ? (
              <XCircle className="size-5 text-red-500" />
            ) : (
              <AlertCircle className="size-5 text-yellow-500" />
            )}
            Specification Validation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isValidating ? (
            <p className="text-muted-foreground">Validating specifications...</p>
          ) : (
            <p
              className={
                validationResult === 'success'
                  ? 'text-green-600'
                  : 'text-red-500'
              }
            >
              {validationMessage}
            </p>
          )}
        </CardContent>
      </Card>

      {/* App Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Application Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">App Name</p>
              <p className="font-medium">{appSpec.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Instances</p>
              <p className="font-medium flex items-center gap-1">
                <Server className="size-4" />
                {appSpec.instances}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="font-medium">{appSpec.description}</p>
            </div>
          </div>

          <Separator />

          {/* Component Details */}
          <div>
            <p className="text-sm font-medium mb-2">Docker Container</p>
            <Badge variant="secondary" className="font-mono">
              {appSpec.compose[0].repotag}
            </Badge>
          </div>

          {/* Resources */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">CPU</p>
                <p className="font-medium">{appSpec.compose[0].cpu} vCores</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MemoryStick className="size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">RAM</p>
                <p className="font-medium">{appSpec.compose[0].ram} MB</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Storage</p>
                <p className="font-medium">{appSpec.compose[0].hdd} GB</p>
              </div>
            </div>
          </div>

          {/* Ports */}
          {appSpec.compose[0].ports.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Ports</p>
              <div className="flex flex-wrap gap-2">
                {appSpec.compose[0].ports.map((port, index) => (
                  <Badge key={index} variant="outline">
                    {port} → {appSpec.compose[0].containerPorts[index]}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Environment Variables */}
          {appSpec.compose[0].environmentParameters.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Environment Variables</p>
              <div className="flex flex-wrap gap-2">
                {appSpec.compose[0].environmentParameters.map((env, index) => (
                  <Badge key={index} variant="outline" className="font-mono text-xs">
                    {env.split('=')[0]}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="size-5" />
            Estimated Cost (Monthly)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isCalculatingPrice ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-muted-foreground">Calculating price...</span>
            </div>
          ) : priceUSD !== null && priceFlux !== null ? (
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-bold">${(priceUSD || 0).toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">USD / month</p>
              </div>
              <div className="text-muted-foreground">≈</div>
              <div>
                <p className="text-2xl font-bold">{(priceFlux || 0).toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">FLUX / month</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Unable to calculate price</p>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950/20 rounded-md">
          {error}
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button
          onClick={handleSign}
          disabled={validationResult !== 'success' || isSigning}
          className="gap-2"
        >
          {isSigning ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Signing...
            </>
          ) : (
            <>
              Sign & Deploy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
