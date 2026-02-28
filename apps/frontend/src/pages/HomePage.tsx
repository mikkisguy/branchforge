import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold tracking-tight text-foreground">
            BranchForge
          </h1>
          <p className="text-xl text-muted-foreground">
            Visual Novel IDE for Ren'Py
          </p>
        </div>

        {/* Sample Components Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Button Examples */}
          <Card>
            <CardHeader>
              <CardTitle>Buttons</CardTitle>
              <CardDescription>Various button styles and states</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </CardContent>
          </Card>

          {/* Input Examples */}
          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
              <CardDescription>Text input field</CardDescription>
            </CardHeader>
            <CardContent>
              <Input type="text" placeholder="Enter some text..." />
            </CardContent>
          </Card>

          {/* Feature Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Ready to Build</CardTitle>
              <CardDescription>
                shadcn/ui is now set up with Tailwind CSS. Add more components
                from the shadcn/ui documentation as needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">Tailwind CSS</strong> for utility-first styling
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">CSS Variables</strong> for easy theming (light/dark mode)
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">cn() utility</strong> for merging Tailwind classes
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button>Get Started</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
