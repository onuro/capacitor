'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StepGeneral } from './step-general';
import { StepComponent } from './step-component';
import { StepReview } from './step-review';
import { StepDeploy } from './step-deploy';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { RegistrationFormData, ComponentFormData, GeneralFormData } from '@/lib/types/app-spec';
import { RESOURCE_LIMITS } from '@/lib/types/app-spec';

const steps = [
  { id: 1, title: 'General Info', description: 'App name and settings' },
  { id: 2, title: 'Component', description: 'Docker configuration' },
  { id: 3, title: 'Review', description: 'Verify and sign' },
  { id: 4, title: 'Deploy', description: 'Test and payment' },
];

const defaultGeneralData: GeneralFormData = {
  name: '',
  description: '',
  instances: RESOURCE_LIMITS.instances.default,
  contactEmail: '',
};

const defaultComponentData: ComponentFormData = {
  name: '',
  description: '',
  repotag: '',
  ports: [{ external: 80, container: 80 }],
  environmentParameters: [],
  commands: '',
  containerData: '',
  cpu: RESOURCE_LIMITS.cpu.default,
  ram: RESOURCE_LIMITS.ram.default,
  hdd: RESOURCE_LIMITS.hdd.default,
};

export function RegistrationWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<RegistrationFormData>({
    general: defaultGeneralData,
    component: defaultComponentData,
  });
  const [registrationHash, setRegistrationHash] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const handleGeneralChange = (data: Partial<GeneralFormData>) => {
    setFormData((prev) => ({
      ...prev,
      general: { ...prev.general, ...data },
    }));
  };

  const handleComponentChange = (data: Partial<ComponentFormData>) => {
    setFormData((prev) => ({
      ...prev,
      component: { ...prev.component, ...data },
    }));
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSignatureComplete = (hash: string, sig: string) => {
    setRegistrationHash(hash);
    setSignature(sig);
    handleNext();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <StepGeneral
            data={formData.general}
            onChange={handleGeneralChange}
            onNext={handleNext}
          />
        );
      case 2:
        return (
          <StepComponent
            data={formData.component}
            onChange={handleComponentChange}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 3:
        return (
          <StepReview
            formData={formData}
            onBack={handleBack}
            onSignatureComplete={handleSignatureComplete}
          />
        );
      case 4:
        return (
          <StepDeploy
            formData={formData}
            registrationHash={registrationHash}
            signature={signature}
            onBack={handleBack}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Progress Steps */}
      <nav className="mb-8">
        <ol className="flex items-center justify-between">
          {steps.map((step, index) => (
            <li key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center w-full">
                <div
                  className={`
                    flex items-center justify-center size-10 rounded-full border-2 transition-colors
                    ${
                      currentStep > step.id
                        ? 'bg-primary border-primary text-primary-foreground'
                        : currentStep === step.id
                        ? 'border-primary text-primary'
                        : 'border-muted-foreground/30 text-muted-foreground'
                    }
                  `}
                >
                  {currentStep > step.id ? (
                    <Check className="size-5" />
                  ) : (
                    <span className="text-sm font-medium">{step.id}</span>
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p
                    className={`text-sm font-medium ${
                      currentStep >= step.id
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground hidden sm:block">
                    {step.description}
                  </p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-4 ${
                    currentStep > step.id ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">{renderStep()}</CardContent>
      </Card>
    </div>
  );
}
