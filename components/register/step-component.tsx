'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { RESOURCE_LIMITS } from '@/lib/types/app-spec';
import type { ComponentFormData } from '@/lib/types/app-spec';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';

interface StepComponentProps {
  data: ComponentFormData;
  onChange: (data: Partial<ComponentFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepComponent({ data, onChange, onNext, onBack }: StepComponentProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handlePortChange = (
    index: number,
    field: 'external' | 'container',
    value: string
  ) => {
    const newPorts = [...data.ports];
    newPorts[index] = {
      ...newPorts[index],
      [field]: parseInt(value) || 0,
    };
    onChange({ ports: newPorts });
  };

  const addPort = () => {
    onChange({
      ports: [...data.ports, { external: 0, container: 0 }],
    });
  };

  const removePort = (index: number) => {
    if (data.ports.length > 1) {
      const newPorts = data.ports.filter((_, i) => i !== index);
      onChange({ ports: newPorts });
    }
  };

  const handleEnvChange = (index: number, field: 'key' | 'value', value: string) => {
    const newEnv = [...data.environmentParameters];
    newEnv[index] = {
      ...newEnv[index],
      [field]: value,
    };
    onChange({ environmentParameters: newEnv });
  };

  const addEnvVar = () => {
    onChange({
      environmentParameters: [...data.environmentParameters, { key: '', value: '' }],
    });
  };

  const removeEnvVar = (index: number) => {
    const newEnv = data.environmentParameters.filter((_, i) => i !== index);
    onChange({ environmentParameters: newEnv });
  };

  const handleNext = () => {
    const newErrors: Record<string, string> = {};

    if (!data.repotag) {
      newErrors.repotag = 'Docker image is required';
    } else if (!data.repotag.includes(':')) {
      newErrors.repotag = 'Docker image must include a tag (e.g., nginx:latest)';
    }

    // Validate ports
    const validPorts = data.ports.filter(
      (p) => p.external > 0 && p.container > 0
    );
    if (validPorts.length === 0) {
      newErrors.ports = 'At least one valid port mapping is required';
    }

    // Check for duplicate external ports
    const externalPorts = validPorts.map((p) => p.external);
    const uniquePorts = new Set(externalPorts);
    if (uniquePorts.size !== externalPorts.length) {
      newErrors.ports = 'External ports must be unique';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Auto-fill component name from app name if empty
    if (!data.name) {
      onChange({ name: 'main' });
    }

    onNext();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Component Configuration</h2>
        <p className="text-muted-foreground">
          Configure your Docker container settings
        </p>
      </div>

      <div className="space-y-6">
        {/* Docker Image */}
        <div className="space-y-2">
          <Label htmlFor="repotag">
            Docker Image <span className="text-red-500">*</span>
          </Label>
          <Input
            id="repotag"
            value={data.repotag}
            onChange={(e) => onChange({ repotag: e.target.value })}
            placeholder="nginx:latest"
            className={errors.repotag ? 'border-red-500' : ''}
          />
          {errors.repotag && (
            <p className="text-sm text-red-500">{errors.repotag}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Format: repository/image:tag (e.g., nginx:latest, node:18-alpine)
          </p>
        </div>

        <Separator />

        {/* Port Mappings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>
              Port Mappings <span className="text-red-500">*</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPort}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Add Port
            </Button>
          </div>
          {errors.ports && (
            <p className="text-sm text-red-500">{errors.ports}</p>
          )}
          <div className="space-y-3">
            {data.ports.map((port, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">External</Label>
                  <Input
                    type="number"
                    value={port.external || ''}
                    onChange={(e) => handlePortChange(index, 'external', e.target.value)}
                    placeholder="80"
                    min={1}
                    max={65535}
                  />
                </div>
                <div className="flex items-end pb-2">
                  <span className="text-muted-foreground">→</span>
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Container</Label>
                  <Input
                    type="number"
                    value={port.container || ''}
                    onChange={(e) => handlePortChange(index, 'container', e.target.value)}
                    placeholder="80"
                    min={1}
                    max={65535}
                  />
                </div>
                {data.ports.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePort(index)}
                    className="mt-5"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Environment Variables */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Environment Variables</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addEnvVar}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Add Variable
            </Button>
          </div>
          {data.environmentParameters.length > 0 ? (
            <div className="space-y-3">
              {data.environmentParameters.map((env, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex-1">
                    <Input
                      value={env.key}
                      onChange={(e) => handleEnvChange(index, 'key', e.target.value)}
                      placeholder="KEY"
                    />
                  </div>
                  <span className="text-muted-foreground">=</span>
                  <div className="flex-1">
                    <Input
                      value={env.value}
                      onChange={(e) => handleEnvChange(index, 'value', e.target.value)}
                      placeholder="value"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEnvVar(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No environment variables configured
            </p>
          )}
        </div>

        <Separator />

        {/* Commands */}
        <div className="space-y-2">
          <Label htmlFor="commands">Startup Commands (Optional)</Label>
          <Textarea
            id="commands"
            value={data.commands}
            onChange={(e) => onChange({ commands: e.target.value })}
            placeholder="npm start"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Optional: Override the container&apos;s default startup command
          </p>
        </div>

        {/* Container Data Path */}
        <div className="space-y-2">
          <Label htmlFor="containerData">Data Volume Path (Optional)</Label>
          <Input
            id="containerData"
            value={data.containerData}
            onChange={(e) => onChange({ containerData: e.target.value })}
            placeholder="/app/data"
          />
          <p className="text-xs text-muted-foreground">
            Path inside container for persistent storage
          </p>
        </div>

        <Separator />

        {/* Resources */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">Resource Allocation</h3>

          {/* CPU */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>CPU (vCores)</Label>
              <span className="text-sm font-medium">{data.cpu}</span>
            </div>
            <Slider
              value={[data.cpu]}
              onValueChange={(value) => onChange({ cpu: value[0] })}
              min={RESOURCE_LIMITS.cpu.min}
              max={RESOURCE_LIMITS.cpu.max}
              step={0.1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{RESOURCE_LIMITS.cpu.min}</span>
              <span>{RESOURCE_LIMITS.cpu.max}</span>
            </div>
          </div>

          {/* RAM */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>RAM (MB)</Label>
              <span className="text-sm font-medium">{data.ram} MB</span>
            </div>
            <Slider
              value={[data.ram]}
              onValueChange={(value) => onChange({ ram: value[0] })}
              min={RESOURCE_LIMITS.ram.min}
              max={RESOURCE_LIMITS.ram.max}
              step={64}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{RESOURCE_LIMITS.ram.min} MB</span>
              <span>{(RESOURCE_LIMITS.ram.max / 1024).toFixed(0)} GB</span>
            </div>
          </div>

          {/* SSD */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Storage (GB)</Label>
              <span className="text-sm font-medium">{data.hdd} GB</span>
            </div>
            <Slider
              value={[data.hdd]}
              onValueChange={(value) => onChange({ hdd: value[0] })}
              min={RESOURCE_LIMITS.hdd.min}
              max={RESOURCE_LIMITS.hdd.max}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{RESOURCE_LIMITS.hdd.min} GB</span>
              <span>{RESOURCE_LIMITS.hdd.max} GB</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={handleNext} className="gap-2">
          Next: Review
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
