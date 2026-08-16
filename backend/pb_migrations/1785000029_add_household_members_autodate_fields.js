/// <reference path="../pb_data/types.d.ts" />

// household_members was created without created/updated autodate fields,
// same gap as deceased_records (see 1785000028). Not currently causing a
// visible bug since the app sorts household_members by sort_order, not
// created — added for consistency and to avoid the same trap if that
// ever changes.

migrate((app) => {
  const hmColl = app.findCollectionByNameOrId("household_members");

  const fields = [
    { name: "created", onCreate: true, onUpdate: false },
    { name: "updated", onCreate: true, onUpdate: true },
  ];

  let changed = false;
  for (const def of fields) {
    if (hmColl.fields.find((f) => f.name === def.name)) {
      console.log(`household_members: ${def.name} already exists, skipping`);
      continue;
    }
    const f = new AutodateField();
    f.name = def.name;
    f.onCreate = def.onCreate;
    f.onUpdate = def.onUpdate;
    hmColl.fields.push(f);
    changed = true;
    console.log(`household_members: added ${def.name} field`);
  }

  if (changed) app.save(hmColl);
});
