# Trading Arena engine: class diagrams (v0.1)

## Engine classes

```mermaid
classDiagram
  direction LR

  class OrderBook {
    -BookSide bids
    -BookSide asks
    -StopOrder[] stops
    -number nextSequence
    -number last
    -BookConfig config
    -LoggedEvent[] events
    -number nextEventId
    -Trade[] tradeLog
    +place(order) PlaceResult
    +modify(orderId, changes) ModifyResult
    +submit(order) Trade[]
    +cancel(orderId) boolean
    +recording() Recording
    +replay(recording, untilEventId)$ OrderBook
    +tape() Trade[]
    +stopOrders() StopOrder[]
    +bestBid() number
    +bestAsk() number
    +spread() number
    +midPrice() number
    +lastPrice() number
    +restingQuantity(side) number
    +pendingStops() number
    +hasOrder(orderId) boolean
    +depth(maxLevels) DepthSnapshot
    -record(event) void
    -process(order) Trade[]
    -remove(orderId) boolean
    -match(order) Trade[]
    -crosses(incoming, resting) boolean
    -rest(order) void
    -triggerStops(timestamp) Trade[]
    -nextTriggeredStop() StopOrder
  }

  class BookSide {
    -PriceLevel[] levels
    -Map byId
    -Side side
    +best() LimitOrder
    +bestPrice() number
    +add(order) void
    +fillBest(quantity) void
    +remove(orderId) boolean
    +has(orderId) boolean
    +get(orderId) LimitOrder
    +reduce(orderId, newQuantity) boolean
    +totalQuantity() number
    +depth(maxLevels) DepthLevel[]
    -isBetter(a, b) boolean
    -insertionIndex(price) number
  }

  class PriceLevel {
    <<interface>>
    +number price
    +LimitOrder[] orders
    +number quantity
  }

  class Validation {
    <<module>>
    +rejection(reason, message) Rejected
    +checkQuantity(quantity, config) Rejected
    +checkPrice(price, config) Rejected
    +validateNewOrder(order, config) Rejected
  }

  class BookConfig {
    <<interface>>
    +number tickSize
    +number lotSize
  }

  OrderBook *-- BookSide : bids and asks
  BookSide *-- PriceLevel : levels
  OrderBook --> BookConfig : config
  OrderBook ..> Validation : uses
```

## Data types

```mermaid
classDiagram
  direction TB

  class BaseOrder {
    <<interface>>
    +string id
    +string traderId
    +Side side
    +number quantity
    +number timestamp
  }

  class LimitOrder {
    <<interface>>
    +type limit
    +number price
  }

  class MarketOrder {
    <<interface>>
    +type market
  }

  class StopOrder {
    <<interface>>
    +type stop
    +number stopPrice
  }

  class Order {
    <<union>>
  }

  class Trade {
    <<interface>>
    +number sequence
    +Side aggressor
    +string buyOrderId
    +string sellOrderId
    +number price
    +number quantity
    +number timestamp
  }

  class DepthLevel {
    <<interface>>
    +number price
    +number quantity
    +number orders
    +number cumulative
  }

  class DepthSnapshot {
    <<interface>>
    +DepthLevel[] bids
    +DepthLevel[] asks
    +number lastPrice
    +number spread
    +number midPrice
  }

  class Rejected {
    <<interface>>
    +ok false
    +RejectReason reason
    +string message
  }

  class PlaceAccepted {
    <<interface>>
    +ok true
    +Trade[] trades
  }

  class ModifyAccepted {
    <<interface>>
    +ok true
    +Trade[] trades
    +boolean keptPriority
  }

  class PlaceResult {
    <<union>>
  }

  class ModifyResult {
    <<union>>
  }

  class ModifyChanges {
    <<interface>>
    +number price
    +number quantity
    +number timestamp
  }

  class BookEvent {
    <<union>>
  }

  class LoggedEvent {
    <<interface>>
    +number eventId
    +BookEvent event
  }

  class Recording {
    <<interface>>
    +BookConfig config
    +LoggedEvent[] events
  }

  BaseOrder <|-- LimitOrder
  BaseOrder <|-- MarketOrder
  BaseOrder <|-- StopOrder
  Order ..> LimitOrder : member
  Order ..> MarketOrder : member
  Order ..> StopOrder : member
  DepthSnapshot *-- DepthLevel : bids and asks
  PlaceResult ..> PlaceAccepted : member
  PlaceResult ..> Rejected : member
  ModifyResult ..> ModifyAccepted : member
  ModifyResult ..> Rejected : member
  BookEvent ..> Order : order-submitted
  BookEvent ..> ModifyChanges : order-modified
  LoggedEvent *-- BookEvent : event
  Recording *-- LoggedEvent : events
```

Notes: `Order`, `PlaceResult`, `ModifyResult` and `BookEvent` are TypeScript union types, so they are shown with the «union» marker. `BookSide` and `PriceLevel` are internal and are not exported from `index.ts`.
