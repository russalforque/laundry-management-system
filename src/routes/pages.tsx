import type { ComponentType } from 'react'
import Account from '../pages/desktop-tablet/Account'
import CustomerDetails from '../pages/desktop-tablet/CustomerDetails'
import Customers from '../pages/desktop-tablet/Customers'
import Dashboard from '../pages/desktop-tablet/Dashboard'
import OrderDetails from '../pages/desktop-tablet/OrderDetails'
import Orders from '../pages/desktop-tablet/Orders'
import Payments from '../pages/desktop-tablet/Payments'
import Printer from '../pages/desktop-tablet/Printer'
import Reports from '../pages/desktop-tablet/Reports'
import Services from '../pages/desktop-tablet/Services'
import Settings from '../pages/desktop-tablet/Settings'
import StoreShift from '../pages/desktop-tablet/StoreShift'
import Users from '../pages/desktop-tablet/Users'
import MobileAccount from '../pages/mobile/MobileAccount'
import MobileChangePin from '../pages/mobile/MobileChangePin'
import MobileCustomerDetails from '../pages/mobile/MobileCustomerDetails'
import MobileCustomers from '../pages/mobile/MobileCustomers'
import MobileDashboard from '../pages/mobile/MobileDashboard'
import MobileOrderDetails from '../pages/mobile/MobileOrderDetails'
import MobileOrders from '../pages/mobile/MobileOrders'
import MobilePayments from '../pages/mobile/MobilePayments'
import MobilePrinter from '../pages/mobile/MobilePrinter'
import MobileReports from '../pages/mobile/MobileReports'
import MobileServices from '../pages/mobile/MobileServices'
import MobileSettings from '../pages/mobile/MobileSettings'
import MobileStoreShift from '../pages/mobile/MobileStoreShift'
import MobileUsers from '../pages/mobile/MobileUsers'

/**
 * Every page as a phone / tablet-desktop pair (the app frame is layouts/AppShell.tsx). App.tsx renders each pair through
 * routes/ScreenSwitch.tsx. /orders/new is routes/NewOrderSession.tsx, which keeps the draft above its pair.
 */
export interface ScreenPair {
  mobile: ComponentType
  wide: ComponentType
}

/** Pages listed in nav.ts, by path. */
export const NAV_PAGES: Record<string, ScreenPair> = {
  '/': { mobile: MobileDashboard, wide: Dashboard },
  '/orders': { mobile: MobileOrders, wide: Orders },
  '/customers': { mobile: MobileCustomers, wide: Customers },
  '/services': { mobile: MobileServices, wide: Services },
  '/reports': { mobile: MobileReports, wide: Reports },
  '/payments': { mobile: MobilePayments, wide: Payments },
  '/store': { mobile: MobileStoreShift, wide: StoreShift },
  '/printer': { mobile: MobilePrinter, wide: Printer },
  '/users': { mobile: MobileUsers, wide: Users },
  '/settings': { mobile: MobileSettings, wide: Settings },
}

export const ORDER_DETAILS: ScreenPair = { mobile: MobileOrderDetails, wide: OrderDetails }
export const CUSTOMER_DETAILS: ScreenPair = { mobile: MobileCustomerDetails, wide: CustomerDetails }
export const ACCOUNT: ScreenPair = { mobile: MobileAccount, wide: Account }
/** Phones change the PIN on its own page; tablets and desktops have it beside the profile on My Account. */
export const CHANGE_PIN: ScreenPair = { mobile: MobileChangePin, wide: Account }
