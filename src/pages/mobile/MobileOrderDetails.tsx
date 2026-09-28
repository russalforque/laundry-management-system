import { useParams } from 'react-router-dom'
import OrderDetailView from '../../components/order/OrderDetailView'
import { useOrderDetail } from '../../hooks/useOrderDetail'

/** Phone Order Details: one scrolling page, next step first (components/order/OrderDetailView.tsx). */
export default function MobileOrderDetails() {
  return <OrderDetailView o={useOrderDetail(Number(useParams().id))} />
}
