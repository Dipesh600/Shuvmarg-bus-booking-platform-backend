'use strict';

const idOf = (value) => String(value?._id || value || '');

const routeOptions = (schedules) => {
  const routes = new Map();
  for (const schedule of schedules) {
    const variant = schedule.variantId;
    const id = idOf(variant);
    if (!id || routes.has(id)) continue;
    routes.set(id, {
      id,
      code: variant?.code || null,
      name: variant?.name || variant?.code || 'Unnamed route',
      direction: variant?.direction || null,
    });
  }
  return [...routes.values()];
};

const scheduleOption = (schedule) => ({
  id: idOf(schedule),
  routeId: idOf(schedule.variantId) || null,
  routeName: schedule.variantId?.name || schedule.variantId?.code || null,
  bus: {
    id: idOf(schedule.busId),
    name: schedule.busId?.busName || null,
    number: schedule.busId?.busNumber || null,
  },
  departureTime: schedule.departureTime,
  arrivalTime: schedule.arrivalTime,
  recurrence: schedule.recurrence,
  daysOfWeek: schedule.daysOfWeek || [],
});

const toResponse = ({ brand, schedules }) => ({
  success: true,
  data: {
    brand: { id: idOf(brand), name: brand.brandName || null },
    routes: routeOptions(schedules),
    schedules: schedules.map(scheduleOption),
  },
});

module.exports = { toResponse };
