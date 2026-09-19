import clsx from "clsx";

export default function Eyebrow({
  as: Tag = "span",
  className,
  children,
  ...rest
}: {
  as?: "span" | "p";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={clsx("font-sans text-micro uppercase text-ink-soft", className)} {...rest}>
      {children}
    </Tag>
  );
}
