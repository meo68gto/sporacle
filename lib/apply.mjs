function profileFrom(record) {
  if (record.profile && typeof record.profile === "object") return record.profile;
  const payload = record.payload && typeof record.payload === "object" ? record.payload : {};
  const name = String(payload.fullName || payload.name || "").trim();
  const parts = name.split(/\s+/);
  return {
    fullName: name || null,
    firstName: payload.firstName || parts[0] || null,
    lastName: payload.lastName || parts.slice(1).join(" ") || null,
    email: payload.email || null,
    phone: payload.phone || null,
    loyaltyId: payload.loyaltyId || payload.customer_code || payload.customer_id || null,
    cdpProfileId: payload.cdpProfileId || null,
  };
}

function isProfileEvent(eventType) {
  return eventType === "profile.upsert" || eventType === "customer" || eventType === "customer.updated";
}

function isBookingEvent(eventType) {
  return (
    eventType.startsWith("spa.") ||
    eventType.startsWith("outlet.") ||
    eventType === "spa.booking.created" ||
    eventType === "outlet.reservation.upsert"
  );
}

export function applyRecord(state, record, source) {
  const eventType = String(record.eventType || record.canonical_type || "unknown");
  const id = `${Date.now()}-${state.events.length + 1}`;
  state.events.push({
    id,
    source,
    eventType,
    payload: record.payload ?? record.profile ?? {},
    createdAt: new Date().toISOString(),
  });
  if (isProfileEvent(eventType)) {
    const profile = profileFrom(record);
    const email = profile.email ? String(profile.email).toLowerCase() : "";
    const existing = state.guests.find(
      (g) =>
        (email && g.email === email) ||
        (profile.loyaltyId && g.loyaltyId === profile.loyaltyId),
    );
    if (existing) {
      Object.assign(existing, { ...profile, email: email || existing.email, updatedAt: new Date().toISOString() });
      return { id, applied: "profile_merged" };
    }
    state.guests.push({
      id: `g-${state.guests.length + 1}`,
      ...profile,
      email: email || null,
      source,
      createdAt: new Date().toISOString(),
    });
    return { id, applied: "profile_added" };
  }
  if (isBookingEvent(eventType)) {
    const payload = record.payload && typeof record.payload === "object" ? record.payload : {};
    state.bookings.push({
      id: `b-${state.bookings.length + 1}`,
      eventType,
      venue: payload.venue || payload.spa || "spa",
      nameOnBooking: payload.nameOnBooking || payload.fullName || payload.name || null,
      startsAt: payload.startsAt || payload.occurredAt || null,
      source,
      createdAt: new Date().toISOString(),
    });
    return { id, applied: "booking" };
  }
  return { id, applied: "stored" };
}
