import * as React from "react";
import { cn } from "@/lib/utils";

export interface AnnouncementHandle {
  announce: (message: string) => void;
}

interface AnnouncementProps extends React.HTMLAttributes<HTMLDivElement> {
  politeness?: "polite" | "assertive";
  regionId?: string;
}

const Announcement = React.forwardRef<AnnouncementHandle, AnnouncementProps>(
  ({ politeness = "polite", regionId, className, ...props }, ref) => {
    const [message, setMessage] = React.useState<{
      id: number;
      text: string;
    } | null>(null);
    const counterRef = React.useRef(0);

    const announce = React.useCallback((message: string) => {
      counterRef.current += 1;
      const id = counterRef.current;
      setMessage({ id, text: message });
    }, []);

    React.useImperativeHandle(
      ref,
      () => ({
        announce,
      }),
      [announce]
    );

    const role = politeness === "assertive" ? "alert" : "status";

    return (
      <div
        role={role}
        aria-live={politeness}
        aria-atomic="true"
        aria-relevant="additions"
        id={regionId}
        className={cn("sr-only", className)}
        {...props}
      >
        {message && <div key={message.id}>{message.text}</div>}
      </div>
    );
  }
);

Announcement.displayName = "Announcement";

export { Announcement };
