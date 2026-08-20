import { ChartAxis, makeChartSeries } from "./types";

const service = makeChartSeries("service_date", "appt_value_by_hour", []);
const booking = makeChartSeries("booking_date", "booking_value_by_source", []);

// @ts-expect-error I6: service_date and booking_date series cannot share an axis
ChartAxis({ dateBasis: "service_date", series: [service, booking] });
