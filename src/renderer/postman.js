// Pure helper: counts request items in a Postman collection tree.

export function countPostmanRequests(items) {
  let c = 0;
  if (!Array.isArray(items)) return 0;
  items.forEach((i) => {
    if (i.item) c += countPostmanRequests(i.item);
    else if (i.request) c++;
  });
  return c;
}
