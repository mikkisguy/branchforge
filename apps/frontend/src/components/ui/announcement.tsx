import * as React from "react";
import { cn } from "@/lib/utils";

export interface AnnouncementHandle {
  announce: (message: string) => void;
}

interface AnnouncementProps extends React.HTMLAttributes<HTMLDivElement> {
  politeness?: "polite" | "assertive";
  regionId?: string;
}

const MAX_MESSAGES = 10;

const Announcement = React.forwardRef<AnnouncementHandle, AnnouncementProps>(
  ({ politeness = "polite", regionId, className, ...props }, ref) => {
    const [messages, setMessages] = React.useState<
      Array<{ id: number; text: string }>
    >([]);
    const counterRef = React.useRef(0);

    const announce = React.useCallback((message: string) => {
      counterRef.current += 1;
      const id = counterRef.current;
      setMessages((prev) => {
        const next = [...prev, { id, text: message }];
        return next.slice(-MAX_MESSAGES);
      });
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
        {messages.map((msg) => (
          <div key={msg.id}>{msg.text}</div>
        ))}
      </div>
    );
  }
);

Announcement.displayName = "Announcement";

export { Announcement };
