import {
  LayoutDashboard,
  PlusCircle,
  Heart,
  Wallet,
  Receipt,
  Server,
  Settings,
  Star,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Services', href: '/my-services', icon: Star },
  { label: 'New Organic Order', href: '/new-order', icon: PlusCircle },
  { label: 'Single Order', href: '/single-order', icon: Zap },
  { label: 'Engagement Orders', href: '/engagement-orders', icon: Heart },
  { label: 'Wallet & Balance', href: '/wallet', icon: Wallet },
  { label: 'Provider API Bills', href: '/provider-bills', icon: Receipt },
  { label: 'Providers & Services', href: '/providers', icon: Server },
  { label: 'Settings', href: '/settings', icon: Settings },
];
