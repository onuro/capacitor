import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Zap,
  Server,
  Shield,
  Globe,
  ArrowRight,
  Cpu,
  HardDrive,
  Network,
} from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="flex-1 flex items-center justify-center px-4 py-16 md:py-24">
        <div className="container max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <Zap className="h-4 w-4" />
            Powered by FluxCloud
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl mb-6">
            Deploy Your Apps on{' '}
            <span className="text-primary">Decentralized</span>{' '}
            Infrastructure
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-muted-foreground mb-8">
            Capacitor makes it simple to deploy Docker containers across the Flux
            decentralized cloud network. High availability, global distribution,
            and transparent pricing.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="gap-2 text-lg px-8">
                Deploy Now
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <a
              href="https://runonflux.io"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="lg" className="text-lg px-8">
                Learn More
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t bg-muted/50 py-16 md:py-24">
        <div className="container max-w-6xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why FluxCloud?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Deploy your applications with confidence on a truly decentralized network
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <Server className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Global Distribution</CardTitle>
                <CardDescription>
                  Your app runs on multiple nodes worldwide for low latency and high availability
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Decentralized & Secure</CardTitle>
                <CardDescription>
                  No single point of failure. Your data and apps are distributed across the network
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Globe className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Free Domain</CardTitle>
                <CardDescription>
                  Every app gets a free subdomain at yourapp.app.runonflux.io out of the box
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Cpu className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Flexible Resources</CardTitle>
                <CardDescription>
                  Choose exactly the CPU, RAM, and storage your application needs
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <HardDrive className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Docker Native</CardTitle>
                <CardDescription>
                  Deploy any Docker image directly. No complex configuration required
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Network className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Load Balanced</CardTitle>
                <CardDescription>
                  Built-in load balancing across all your instances automatically
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="container max-w-4xl px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Deploy?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Connect your wallet and deploy your first application in minutes.
            Pay only for what you use with transparent FLUX pricing.
          </p>
          <Link href="/register">
            <Button size="lg" className="gap-2">
              Start Deploying
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
