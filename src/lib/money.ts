/** I2/I3: integer cents only. No float construction path. */

export type Money = {
  readonly __brand: "Money";
  readonly cents: number;
};

export function fromCents(cents: number): Money {
  if (!Number.isInteger(cents)) {
    throw new Error("Money.fromCents requires an integer cent value");
  }
  return { __brand: "Money", cents };
}

export function toDisplay(money: Money): string {
  const sign = money.cents < 0 ? "-" : "";
  const abs = Math.abs(money.cents);
  const dollars = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${cents}`;
}

export function addMoney(a: Money, b: Money): Money {
  return fromCents(a.cents + b.cents);
}
