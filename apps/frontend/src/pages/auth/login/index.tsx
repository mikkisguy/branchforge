import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import {
  Announcement,
  type AnnouncementHandle,
} from "@/components/ui/announcement";
import { BASE_URL } from "@/lib/constants";
import { APP_NAME } from "../../../lib/version";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const announceRef = useRef<AnnouncementHandle>(null);

  useEffect(() => {
    if (error) {
      announceRef.current?.announce(error);
    }
  }, [error]);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
      navigate(`${BASE_URL}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center p-4"
    >
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Logo className="text-4xl" />
        </div>
        <Card>
          <CardHeader>
            <h2 className="font-semibold leading-none tracking-tight">
              Sign In
            </h2>
            <CardDescription>
              Enter your credentials to access {APP_NAME}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit} noValidate>
            <CardContent className="space-y-4">
              <Announcement ref={announceRef} politeness="assertive" />
              {error && <FormErrorMessage id="login-error" message={error} />}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  disabled={isLoading}
                  minLength={8}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link
                  to={`${BASE_URL}register`}
                  className="text-primary hover:underline"
                >
                  Sign up
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  );
}
