import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import { emailSchema, usernameSchema } from "@/shared/lib/authValidation";

/** Debounced "is this email / username taken?" lookup used on the sign-up tab. */
export function useSignupAvailability(
  activeTab: "signin" | "signup",
  normalizedEmail: string,
  normalizedUsername: string,
) {
  const [debouncedSignupEmail, setDebouncedSignupEmail] = useState("");
  const [debouncedSignupUsername, setDebouncedSignupUsername] = useState("");

  useEffect(() => {
    if (activeTab !== "signup") {
      setDebouncedSignupEmail("");
      setDebouncedSignupUsername("");
      return;
    }

    const emailValid = emailSchema.safeParse(normalizedEmail).success;
    const usernameValid = usernameSchema.safeParse(normalizedUsername).success;

    if (!emailValid && !usernameValid) {
      setDebouncedSignupEmail("");
      setDebouncedSignupUsername("");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedSignupEmail(emailValid ? normalizedEmail : "");
      setDebouncedSignupUsername(usernameValid ? normalizedUsername : "");
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, normalizedEmail, normalizedUsername]);

  const { data: signupAvailability, isFetching: isCheckingSignupAvailability } = useQuery({
    queryKey: ["signup-availability", debouncedSignupEmail, debouncedSignupUsername],
    queryFn: () =>
      mongoClient.checkRegistrationAvailability({
        email: debouncedSignupEmail,
        username: debouncedSignupUsername,
      }),
    enabled:
      activeTab === "signup" &&
      Boolean(debouncedSignupEmail || debouncedSignupUsername),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const isCurrentEmailAvailability =
    debouncedSignupEmail.length > 0 && debouncedSignupEmail === normalizedEmail;
  const isCurrentUsernameAvailability =
    debouncedSignupUsername.length > 0 &&
    debouncedSignupUsername === normalizedUsername;

  const availabilityErrors = useMemo(() => {
    if (activeTab !== "signup") return {} as Record<string, string>;

    const nextErrors: Record<string, string> = {};
    if (isCurrentUsernameAvailability && signupAvailability?.username_exists) {
      nextErrors.username = "Username already taken";
    }
    if (isCurrentEmailAvailability && signupAvailability?.email_exists) {
      nextErrors.email = "Email already registered";
    }
    return nextErrors;
  }, [activeTab, isCurrentEmailAvailability, isCurrentUsernameAvailability, signupAvailability]);

  return {
    signupAvailability,
    isCheckingSignupAvailability,
    debouncedSignupEmail,
    debouncedSignupUsername,
    isCurrentEmailAvailability,
    isCurrentUsernameAvailability,
    availabilityErrors,
  };
}
