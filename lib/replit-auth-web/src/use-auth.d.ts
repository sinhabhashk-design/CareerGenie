import type { AuthUser } from "@workspace/api-client-react";
export type { AuthUser };
interface AuthState {
    user: AuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: () => void;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<{
        requiresEmailConfirmation?: boolean;
    }>;
    logout: () => void;
}
export declare function useAuth(): AuthState;
//# sourceMappingURL=use-auth.d.ts.map