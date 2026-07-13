import { useReducer } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
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
import { InlineMessage } from "@/components/ui/inline-error";
import { BASE_URL } from "@/lib/constants";
import { APP_NAME } from "../../../lib/version";

interface FormState {
  email: string;
  password: string;
  confirmPassword: string;
  error: string;
  isLoading: boolean;
}

type FormAction =
  | { type: "SET_EMAIL"; value: string }
  | { type: "SET_PASSWORD"; value: string }
  | { type: "SET_CONFIRM_PASSWORD"; value: string }
  | { type: "SET_ERROR"; value: string }
  | { type: "SET_LOADING"; value: boolean }
  | { type: "RESET" };

const initialFormState: FormState = {
  email: "",
  password: "",
  confirmPassword: "",
  error: "",
  isLoading: false,
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_EMAIL":
      return { ...state, email: action.value };
    case "SET_PASSWORD":
      return { ...state, password: action.value };
    case "SET_CONFIRM_PASSWORD":
      return { ...state, confirmPassword: action.value };
    case "SET_ERROR":
      return { ...state, error: action.value };
    case "SET_LOADING":
      return { ...state, isLoading: action.value };
    case "RESET":
      return { ...state, error: "", isLoading: false };
    default:
      return state;
  }
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { signUpsEnabled, isLoading: settingsLoading } = useSettings();
  const [state, dispatch] = useReducer(formReducer, initialFormState);

  // Show loading state while checking settings
  if (settingsLoading) {
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
                Create Account
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Loading…</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Show disabled state when signups are closed
  if (!signUpsEnabled) {
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
                Registration Closed
              </h2>
              <CardDescription>
                New user registration is currently disabled. Please contact an
                administrator.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  to={`${BASE_URL}login`}
                  className="text-primary hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </main>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    dispatch({ type: "SET_ERROR", value: "" });

    if (state.password.length < 8) {
      dispatch({
        type: "SET_ERROR",
        value: "Password must be at least 8 characters",
      });
      return;
    }

    if (state.password !== state.confirmPassword) {
      dispatch({ type: "SET_ERROR", value: "Passwords do not match" });
      return;
    }

    dispatch({ type: "SET_LOADING", value: true });

    try {
      await register(state.email, state.password);
      navigate(`${BASE_URL}`);
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        value: err instanceof Error ? err.message : "Registration failed",
      });
    } finally {
      dispatch({ type: "SET_LOADING", value: false });
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
              Create Account
            </h2>
            <CardDescription>
              Register for {APP_NAME} to start creating visual novels
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {state.error && (
                <InlineMessage variant="error">{state.error}</InlineMessage>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={state.email}
                  onChange={(e) =>
                    dispatch({ type: "SET_EMAIL", value: e.target.value })
                  }
                  required
                  disabled={state.isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={state.password}
                  onChange={(e) =>
                    dispatch({ type: "SET_PASSWORD", value: e.target.value })
                  }
                  required
                  disabled={state.isLoading}
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={state.confirmPassword}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_CONFIRM_PASSWORD",
                      value: e.target.value,
                    })
                  }
                  required
                  disabled={state.isLoading}
                  minLength={8}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                type="submit"
                className="w-full"
                disabled={state.isLoading}
              >
                {state.isLoading ? "Creating account…" : "Create Account"}
              </Button>
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  to={`${BASE_URL}login`}
                  className="text-primary hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  );
}
