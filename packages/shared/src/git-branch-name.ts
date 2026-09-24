/**
 * True when any `/`-separated component is empty, starts with `.`,
 * ends with `.`, or ends with `.lock`.
 */
export function hasInvalidBranchComponent(name: string): boolean {
  return name.split("/").some((component) => {
    return (
      component === "" ||
      component.startsWith(".") ||
      component.endsWith(".") ||
      component.endsWith(".lock")
    );
  });
}
