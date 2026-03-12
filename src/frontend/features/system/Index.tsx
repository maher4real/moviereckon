import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/frontend/hooks/useAuth";
import { CenteredAppSkeleton } from "@/frontend/components/AppSkeletons";

const Index = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      navigate(user ? "/home" : "/auth");
    }
  }, [user, isLoading, navigate]);

  return (
    <CenteredAppSkeleton />
  );
};

export default Index;
