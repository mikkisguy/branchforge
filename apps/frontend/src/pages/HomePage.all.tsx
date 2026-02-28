import { useState } from "react";
import OriginalHomePage from "./HomePage";
import HomePageVN from "./HomePage.vn";
import HomePageIDE from "./HomePage.ide";
import HomePageAsymmetric from "./HomePage.asymmetric";
import HomePageStorybookIDE from "./HomePage.storybook-ide";

export default function AllDesignsPage() {
  const [activeDesign, setActiveDesign] = useState<"original" | "vn" | "ide" | "asymmetric" | "storybook-ide">("storybook-ide");

  const designs = [
    { id: "original", name: "Original", desc: "Current shadcn design" },
    { id: "vn", name: "Visual Novel", desc: "Storybook aesthetic with dialogue boxes" },
    { id: "ide", name: "IDE First", desc: "Developer-focused workspace" },
    { id: "asymmetric", name: "Break the Grid", desc: "Non-traditional layout" },
    { id: "storybook-ide", name: "Storybook IDE", desc: "Storybook aesthetic + IDE functionality" },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Design Switcher Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Design:</span>
            <div className="flex gap-1">
              {designs.map((design) => (
                <button
                  key={design.id}
                  onClick={() => setActiveDesign(design.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeDesign === design.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {design.name}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {designs.find(d => d.id === activeDesign)?.desc}
          </div>
        </div>
      </div>

      {/* Active Design */}
      <div className="pt-14">
        {activeDesign === "original" && <OriginalHomePage />}
        {activeDesign === "vn" && <HomePageVN />}
        {activeDesign === "ide" && <HomePageIDE />}
        {activeDesign === "asymmetric" && <HomePageAsymmetric />}
        {activeDesign === "storybook-ide" && <HomePageStorybookIDE />}
      </div>
    </div>
  );
}
