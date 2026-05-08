import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button, type ButtonProps } from "@/frontend/components/ui/button";
import { useToast } from "@/frontend/hooks/use-toast";
import {
  shareContentDetails,
  type ShareContentDetails,
} from "@/frontend/lib/shareContentCard";
import { cn } from "@/shared/lib/utils";

interface ShareContentButtonProps extends ShareContentDetails {
  className?: string;
  iconOnly?: boolean;
  size?: ButtonProps["size"];
}

export default function ShareContentButton({
  className,
  iconOnly = false,
  size = "lg",
  ...shareDetails
}: ShareContentButtonProps) {
  const { toast } = useToast();
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    if (isSharing) return;

    setIsSharing(true);
    try {
      const result = await shareContentDetails(shareDetails);
      if (result.method === "clipboard") {
        toast({
          title: "Share details copied",
          description: "Paste the movie card details into any social app.",
        });
      }
    } catch {
      toast({
        title: "Sharing unavailable",
        description: "Copy the page link and try sharing it from your social app.",
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      className={cn(
        "action-btn bg-muted text-foreground hover:bg-primary/20 hover:text-primary",
        className,
      )}
      onClick={() => void handleShare()}
      disabled={isSharing}
      aria-label={`Share ${shareDetails.title}`}
    >
      <Share2 className={cn("w-5 h-5", !iconOnly && "mr-2")} />
      {!iconOnly && (isSharing ? "Preparing" : "Share")}
    </Button>
  );
}
