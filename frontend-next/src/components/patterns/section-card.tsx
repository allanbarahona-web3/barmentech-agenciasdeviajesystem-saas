import * as React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type SectionCardProps = Omit<React.ComponentProps<typeof Card>, "title"> & {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  contentClassName?: string
}

function SectionCard({
  title,
  description,
  actions,
  contentClassName,
  children,
  ...props
}: SectionCardProps) {
  const hasHeader = title || description || actions

  return (
    <Card {...props}>
      {hasHeader ? (
        <CardHeader>
          <div>
            {title ? <CardTitle>{title}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}

export { SectionCard, type SectionCardProps }
