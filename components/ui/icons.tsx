import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { decorative?: boolean };

function IconFrame({ decorative = true, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return <IconFrame {...props}><path d="m5 12 4 4L19 6" /></IconFrame>;
}
export function AlertIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></IconFrame>;
}
export function InfoIcon(props: IconProps) {
  return <IconFrame {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></IconFrame>;
}
export function ClockIcon(props: IconProps) {
  return <IconFrame {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></IconFrame>;
}
export function CircleIcon(props: IconProps) {
  return <IconFrame {...props}><circle cx="12" cy="12" r="8" /></IconFrame>;
}
export function ArrowIcon(props: IconProps) {
  return <IconFrame className="ui-directional-icon" {...props}><path d="M5 12h14m-6-6 6 6-6 6" /></IconFrame>;
}
export function CloseIcon(props: IconProps) {
  return <IconFrame {...props}><path d="m6 6 12 12M18 6 6 18" /></IconFrame>;
}
export function SparkleIcon(props: IconProps) {
  return <IconFrame {...props}><path d="m12 3 1.5 6.5L20 12l-6.5 1.5L12 20l-1.5-6.5L4 12l6.5-2.5L12 3Z" /></IconFrame>;
}
