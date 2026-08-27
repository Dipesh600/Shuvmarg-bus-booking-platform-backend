'use strict';

const toTerms = (assignment) => ({
  accessScope: assignment.accessScope,
  allowedRouteIds: (assignment.allowedRouteIds || []).map(String),
  allowedScheduleIds: (assignment.allowedScheduleIds || []).map(String),
  permissions: {
    canSellCash: assignment.permissions?.canSellCash,
    canSellOnline: assignment.permissions?.canSellOnline,
    canCancel: assignment.permissions?.canCancel,
    cancelWindowMins: assignment.permissions?.cancelWindowMins,
    maxSeatsPerBooking: assignment.permissions?.maxSeatsPerBooking ?? null,
    maxDiscountPct: assignment.permissions?.maxDiscountPct,
  },
  commission: {
    mode: assignment.operatorCommission?.mode,
    value: assignment.operatorCommission?.value,
  },
});

const brandOf = (assignment) => {
  const brand = assignment.operatorId;
  return {
    id: brand?._id || brand || null,
    name: brand?.brandName || null,
  };
};

const effectiveStatus = (assignment, now) => (
  assignment.status === 'INVITED'
  && assignment.expiresAt
  && new Date(assignment.expiresAt).getTime() <= now.getTime()
    ? 'EXPIRED'
    : assignment.status
);

const toListItem = (assignment, now) => {
  const item = {
    assignmentId: assignment._id,
    status: effectiveStatus(assignment, now),
    brand: brandOf(assignment),
    invitedAt: assignment.invitedAt || null,
    expiresAt: assignment.expiresAt || null,
    acceptedAt: assignment.acceptedAt || null,
    declinedAt: assignment.declinedAt || null,
    ...toTerms(assignment),
  };
  if (assignment.status === 'DECLINED') item.statusReason = assignment.statusReason || null;
  return item;
};

const toListResponse = ({ rows, total, page, limit, now }) => ({
  success: true,
  data: rows.map((row) => toListItem(row, now)),
  pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
});

/** Explicit fields only: internal ownership and operator contact data stay out. */
const toResponse = (assignment, action) => {
  const data = {
    assignmentId: assignment._id,
    status: assignment.status,
    acceptedAt: assignment.acceptedAt || null,
    declinedAt: assignment.declinedAt || null,
    brand: brandOf(assignment),
    ...toTerms(assignment),
  };

  // statusReason belongs to the actor who wrote it. Accept can only expose an
  // operator-authored value, while decline returns the agent's own text.
  if (action === 'decline') data.statusReason = assignment.statusReason || null;

  return {
    success: true,
    message: action === 'accept'
      ? 'Assignment invitation accepted.'
      : 'Assignment invitation declined.',
    data,
  };
};

module.exports = { toListResponse, toResponse };
