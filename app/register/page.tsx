'use client';

import { useAuthStore } from '@/stores/auth';
import { RegistrationWizard } from '@/components/register/wizard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConnectButton } from '@/components/wallet/connect-button';
import { Wallet, CheckCircle } from 'lucide-react';

export default function RegisterPage() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return (
      <div className="container max-w-2xl py-16 px-4">
        <Card className="text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <Wallet className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">Connect Your Wallet</CardTitle>
            <CardDescription className="text-base">
              To deploy an application on FluxCloud, you need to connect your wallet first.
              This is used to verify your identity and sign transactions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <ConnectButton />
            </div>

            <div className="border-t pt-6">
              <h3 className="font-medium mb-4">Why connect a wallet?</h3>
              <ul className="text-sm text-muted-foreground space-y-2 text-left max-w-sm mx-auto">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Securely sign your app registration
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Prove ownership of your deployed apps
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Pay for hosting with FLUX tokens
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Manage your apps anytime
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 px-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Deploy Your Application</h1>
        <p className="text-muted-foreground">
          Configure and deploy your Docker container on FluxCloud
        </p>
      </div>

      <RegistrationWizard />
    </div>
  );
}
