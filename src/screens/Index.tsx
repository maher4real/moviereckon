import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CenteredAppSkeleton } from "@/components/AppSkeletons";

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
