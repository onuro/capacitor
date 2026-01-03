'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/stores/auth';
import { registerApp, getDeploymentInfo } from '@/lib/api/apps';
import { DEFAULT_EXPIRE_BLOCKS } from '@/lib/types/app-spec';
import type { RegistrationFormData, AppSpec, ComponentSpec } from '@/lib/types/app-spec';
import {
  ChevronLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink,
  Clock,
  Wallet,
  Rocket,
} from 'lucide-react';
import Link from 'next/link';

interface StepDeployProps {
  formData: RegistrationFormData;
  registrationHash: string | null;
  signature: string | null;
  onBack: () => void;
}

type DeploymentStatus = 'idle' | 'registering' | 'success' | 'error';

export function StepDeploy({
  formData,
  registrationHash,
  signature,
  onBack,
}: StepDeployProps) {
  const { zelid, zelidauth } = useAuthStore();

  const [status, setStatus] = useState<DeploymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [paymentAddress, setPaymentAddress] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Build the app specification from form data
  const buildAppSpec = (): AppSpec => {
    const component: ComponentSpec = {
      name: formData.component.name || 'main',
      description: formData.component.description || formData.general.description,
      repotag: formData.component.repotag,
      ports: formData.component.ports.filter((p) => p.external > 0).map((p) => p.external),
      containerPorts: formData.component.ports.filter((p) => p.container > 0).map((p) => p.container),
      domains: [],
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

  // Start deployment
  useEffect(() => {
    const deploy = async () => {
      if (!signature || !zelidauth || status !== 'idle') return;

      setStatus('registering');
      setError(null);

      try {
        // Get deployment info first
        const deployInfo = await getDeploymentInfo();
        if (deployInfo.status === 'success' && deployInfo.data) {
          setPaymentAddress(deployInfo.data.address);
        }

        const appSpec = buildAppSpec();
        const timestamp = Date.now();

        const registrationData = {
          appSpecifications: appSpec,
          timestamp,
          signature,
          type: 'fluxappregister',
          version: 8,
        };

        const result = await registerApp(zelidauth, registrationData);

        if (result.status === 'success') {
          setStatus('success');
          if (result.data?.hash) {
            setTxHash(result.data.hash);
          }
        } else {
          setStatus('error');
          setError(result.data?.message || 'Registration failed');
        }
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Registration failed');
      }
    };

    deploy();
  }, [signature, zelidauth]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy');
    }
  };

  // Success state
  if (status === 'success') {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center size-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
            <CheckCircle className="size-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Registration Successful!</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Your application <span className="font-medium">{formData.general.name}</span> has been
            submitted for deployment on FluxCloud.
          </p>
        </div>

        {paymentAddress && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="size-5" />
                Payment Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Send the required FLUX amount to the following address to complete deployment:
              </p>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                <span className="truncate flex-1">{paymentAddress}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(paymentAddress)}
                >
                  {copied ? (
                    <CheckCircle className="size-4 text-green-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" />
                <span>Payment window: 30 minutes</span>
              </div>
            </CardContent>
          </Card>
        )}

        {txHash && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Transaction Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {txHash}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Rocket className="size-5" />
              What&apos;s Next?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              After payment confirmation, your app will be deployed across {formData.general.instances} FluxCloud nodes.
            </p>
            <ul className="text-sm space-y-2">
              <li className="flex items-center gap-2">
                <CheckCircle className="size-4 text-green-500" />
                Your app will be available at: <code className="text-xs bg-muted px-2 py-0.5 rounded">{formData.general.name}.app.runonflux.io</code>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="size-4 text-green-500" />
                Deployment typically takes 5-10 minutes
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-4 pt-4">
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
          <a
            href={`https://cloud.runonflux.com/apps/${formData.general.name}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="gap-2">
              View on FluxCloud
              <ExternalLink className="size-4" />
            </Button>
          </a>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center size-16 bg-red-100 dark:bg-red-900/30 rounded-full mb-4">
            <XCircle className="size-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Registration Failed</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            There was an error registering your application. Please try again.
          </p>
        </div>

        {error && (
          <Card className="border-red-200 dark:border-red-900">
            <CardContent className="pt-6">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-center gap-4 pt-4">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ChevronLeft className="size-4" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div className="space-y-6">
      <div className="text-center py-12">
        <Loader2 className="size-12 animate-spin mx-auto mb-4 text-primary" />
        <h2 className="text-2xl font-bold mb-2">Registering Your App</h2>
        <p className="text-muted-foreground">
          Please wait while we register your application on FluxCloud...
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-6 rounded-full bg-primary flex items-center justify-center">
                <CheckCircle className="size-4 text-primary-foreground" />
              </div>
              <span>Specifications validated</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="size-6 rounded-full bg-primary flex items-center justify-center">
                <CheckCircle className="size-4 text-primary-foreground" />
              </div>
              <span>Transaction signed</span>
            </div>
            <div className="flex items-center gap-3">
              <Loader2 className="size-6 animate-spin text-primary" />
              <span>Submitting to FluxCloud...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
