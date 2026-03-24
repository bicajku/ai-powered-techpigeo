declare module 'lucide-react/dist/esm/icons/*' {
  import { ForwardRefExoticComponent, RefAttributes } from 'react'
  
  export interface LucideProps {
    color?: string
    size?: string | number
    strokeWidth?: string | number
    absoluteStrokeWidth?: boolean
    className?: string
    [key: string]: unknown
  }
  
  export type LucideIcon = ForwardRefExoticComponent<
    LucideProps & RefAttributes<SVGSVGElement>
  >
  
  const Icon: LucideIcon
  export default Icon
}
