import { useState, useEffect, useCallback } from "react";
import { 
  User, 
  LoginRequest, 
  useLogin, 
  useLogout, 
  useGetCurrentUser,
  getGetCurrentUserQueryKey
} from "@workspace/api-client-react";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Use the generated query hook to fetch the current user
  const { 
    data: currentUser, 
    isLoading: isMeLoading, 
    refetch 
  } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      enabled: !!localStorage.getItem("caaspp_token"),
      retry: false,
    }
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  useEffect(() => {
    if (currentUser) {
      setUser(currentUser);
      localStorage.setItem("caaspp_user", JSON.stringify(currentUser));
    } else if (!isMeLoading) {
      // If we're not loading and have no user, check localStorage for a cached user
      // for a snappier UI transitions, but fall back to null if no token exists
      const storedUser = localStorage.getItem("caaspp_user");
      const hasToken = !!localStorage.getItem("caaspp_token");
      
      if (storedUser && hasToken) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    }
    
    if (!isMeLoading) {
      setIsLoading(false);
    }
  }, [currentUser, isMeLoading]);

  const login = useCallback(async (credentials: LoginRequest) => {
    setIsLoading(true);
    try {
      const response = await loginMutation.mutateAsync({ data: credentials });
      
      localStorage.setItem("caaspp_token", response.token);
      localStorage.setItem("caaspp_user", JSON.stringify(response.user));
      setUser(response.user);
      
      // Refetch the "me" query to sync state
      await refetch();
      
      setIsLoading(false);
      return response.user;
    } catch (err) {
      setIsLoading(false);
      throw err;
    }
  }, [loginMutation, refetch]);

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (e) {
      console.error("Logout API call failed", e);
    } finally {
      localStorage.removeItem("caaspp_user");
      localStorage.removeItem("caaspp_token");
      setUser(null);
      window.location.href = "/";
    }
  }, [logoutMutation]);

  return {
    user,
    isLoading: isLoading || isMeLoading,
    login,
    logout,
    isAuthenticated: !!user && !!localStorage.getItem("caaspp_token")
  };
}

