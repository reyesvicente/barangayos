/// <reference path="../pb_data/types.d.ts" />

// deceased_records was created without created/updated autodate fields,
// which breaks any query that sorts by them (the default sort used by
// the frontend's getDeceasedRecords()).

migrate((app) => {
  const drColl = app.findCollectionByNameOrId("deceased_records");

  const fields = [
    { name: "created", onCreate: true, onUpdate: false },
    { name: "updated", onCreate: true, onUpdate: true },
  ];

  let changed = false;
  for (const def of fields) {
    if (drColl.fields.find((f) => f.name === def.name)) {
      console.log(`deceased_records: ${def.name} already exists, skipping`);
      continue;
    }
    const f = new AutodateField();
    f.name = def.name;
    f.onCreate = def.onCreate;
    f.onUpdate = def.onUpdate;
    drColl.fields.push(f);
    changed = true;
    console.log(`deceased_records: added ${def.name} field`);
  }

  if (changed) app.save(drColl);
});
