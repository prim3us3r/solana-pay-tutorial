import { PropsWithChildren } from 'react'

export default function SiteHeading({ children }: PropsWithChildren<{}>) {
  return (
    <h1 className="my-8 self-center bg-clip-text text-8xl font-extrabold text-[#f6f6e9] ">
      {children}
    </h1>
  )
}
