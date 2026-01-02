'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { useAuthStore } from '@/stores/auth';
import { isAppNameAvailable } from '@/lib/api/apps';
import { RESOURCE_LIMITS } from '@/lib/types/app-spec';
import type { GeneralFormData } from '@/lib/types/app-spec';
import { ChevronRight, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface StepGeneralProps {
  data: GeneralFormData;
  onChange: (data: Partial<GeneralFormData>) => void;
  onNext: () => void;
}

export function StepGeneral({ data, onChange, onNext }: StepGeneralProps) {
  const { zelid } = useAuthStore();
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateName = (name: string): string | null => {
    if (!name) return 'App name is required';
    if (name.length < 3) return 'App name must be at least 3 characters';
    if (name.length > 32) return 'App name must be less than 32 characters';
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) {
      return 'App name must start with a letter and contain only alphanumeric characters';
    }
    return null;
  };

  const handleNameChange = async (value: string) => {
    const lowercaseName = value.toLowerCase();
    onChange({ name: lowercaseName });
    setNameAvailable(null);

    const error = validateName(lowercaseName);
    if (error) {
      setErrors((prev) => ({ ...prev, name: error }));
      return;
    }

    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.name;
      return newErrors;
    });

    // Check if name is available
    setIsCheckingName(true);
    try {
      const available = await isAppNameAvailable(lowercaseName);
      setNameAvailable(available);
      if (!available) {
        setErrors((prev) => ({ ...prev, name: 'This app name is already taken' }));
      }
    } catch {
      // Ignore errors, assume available
      setNameAvailable(true);
    } finally {
      setIsCheckingName(false);
    }
  };

  const handleNext = () => {
    const newErrors: Record<string, string> = {};

    const nameError = validateName(data.name);
    if (nameError) newErrors.name = nameError;
    if (nameAvailable === false) newErrors.name = 'This app name is already taken';
    if (!data.description) newErrors.description = 'Description is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onNext();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">General Information</h2>
        <p className="text-muted-foreground">
          Provide basic information about your application
        </p>
      </div>

      <div className="space-y-4">
        {/* App Name */}
        <div className="space-y-2">
          <Label htmlFor="name">
            App Name <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              id="name"
              value={data.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="myapp"
              className={errors.name ? 'border-red-500' : ''}
            />
            {isCheckingName && (
              <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-muted-foreground" />
            )}
            {!isCheckingName && nameAvailable === true && data.name && (
              <CheckCircle className="absolute right-3 top-2.5 h-5 w-5 text-green-500" />
            )}
            {!isCheckingName && nameAvailable === false && (
              <XCircle className="absolute right-3 top-2.5 h-5 w-5 text-red-500" />
            )}
          </div>
          {errors.name && (
            <p className="text-sm text-red-500">{errors.name}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Lowercase alphanumeric, must start with a letter. This will be your app&apos;s unique identifier.
          </p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">
            Description <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="description"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Describe what your application does..."
            rows={3}
            className={errors.description ? 'border-red-500' : ''}
          />
          {errors.description && (
            <p className="text-sm text-red-500">{errors.description}</p>
          )}
        </div>

        {/* Owner */}
        <div className="space-y-2">
          <Label htmlFor="owner">Owner</Label>
          <Input
            id="owner"
            value={zelid || ''}
            disabled
            className="bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            Your wallet address (auto-filled from your connected wallet)
          </p>
        </div>

        {/* Instances */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Number of Instances</Label>
            <span className="text-sm font-medium">{data.instances}</span>
          </div>
          <Slider
            value={[data.instances]}
            onValueChange={(value) => onChange({ instances: value[0] })}
            min={RESOURCE_LIMITS.instances.min}
            max={RESOURCE_LIMITS.instances.max}
            step={1}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{RESOURCE_LIMITS.instances.min}</span>
            <span>{RESOURCE_LIMITS.instances.max}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Your app will be deployed across multiple nodes for redundancy and load balancing
          </p>
        </div>

        {/* Contact Email (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="contactEmail">Contact Email (Optional)</Label>
          <Input
            id="contactEmail"
            type="email"
            value={data.contactEmail}
            onChange={(e) => onChange({ contactEmail: e.target.value })}
            placeholder="your@email.com"
          />
          <p className="text-xs text-muted-foreground">
            Optional email for support notifications
          </p>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={handleNext} className="gap-2">
          Next: Component Config
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
