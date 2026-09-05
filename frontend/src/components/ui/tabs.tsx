import * as React from "react";

interface TabsProps {
  defaultValue: string;
  orientation?: "vertical" | "horizontal";
  className?: string;
  children: React.ReactNode;
}

interface TabsListProps {
  className?: string;
  children: React.ReactNode;
  orientation?: "vertical" | "horizontal";
}

interface TabsTriggerProps {
  value: string;
  className?: string;
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}

interface TabsContentProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

const TabsContext = React.createContext<((value: string) => void) | null>(null);

export function Tabs({ defaultValue, orientation = "vertical", className, children }: TabsProps) {
  const [value, setValue] = React.useState<string>(defaultValue);

  return (
    <TabsContext.Provider value={setValue}>
    <div className={className}>
      <div className={`tabs-layout ${orientation}`}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child) && child.type === TabsList) {
            return React.cloneElement(child, { orientation } as React.ComponentProps<typeof TabsList>);
          }
          if (React.isValidElement(child) && child.type === TabsContent && (child as React.ReactElement<TabsContentProps>).props.value === value) return React.cloneElement(child, {});
          return null;
        })}
      </div>
    </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ orientation = "vertical", className, children }: TabsListProps) {
  const cls = orientation === "vertical"
    ? "flex flex-col items-start"
    : "flex flex-row items-center";
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowLeft") return;
    const triggers = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const currentIndex = triggers.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0 || triggers.length === 0) return;
    event.preventDefault();
    const forward = orientation === "vertical" ? event.key === "ArrowDown" : event.key === "ArrowRight";
    const backward = orientation === "vertical" ? event.key === "ArrowUp" : event.key === "ArrowLeft";
    if (!forward && !backward) return;
    const nextIndex = (currentIndex + (forward ? 1 : -1) + triggers.length) % triggers.length;
    triggers[nextIndex].focus();
    triggers[nextIndex].click();
  };
  return <div role="tablist" aria-orientation={orientation} onKeyDown={handleKeyDown} className={`${cls} ${className}`}>{children}</div>;
}

export function TabsTrigger({ value, className, children, active = false, onClick }: TabsTriggerProps) {
  const setValue = React.useContext(TabsContext);
  const baseCls = "flex items-center justify-between px-4 py-2 text-sm font-medium text-ink-3 hover:text-ink hover:bg-surface/50 transition-all";
  const activeCls = active ? "text-brand bg-brand/10" : "text-ink-3 hover:text-ink hover:bg-surface/50";
  return (
    <button
      data-tab-value={value}
      id={`tab-${value}`}
      role="tab"
      aria-selected={active}
      aria-controls={`panel-${value}`}
      tabIndex={active ? 0 : -1}
      className={`${baseCls} ${activeCls} ${className}`}
      onClick={() => { setValue?.(value); onClick?.(); }}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }: TabsContentProps) {
  return <div id={`panel-${value}`} role="tabpanel" aria-labelledby={`tab-${value}`} className={`${className} mt-4`}>{children}</div>;
}
