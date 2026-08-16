/// <reference path="../pb_data/types.d.ts" />

// Barangay Officials & Appointees
// Adds a barangay_personnel collection linking a resident to a civic
// position (elected official or appointee). Category (official vs.
// appointee) is derived on the frontend from the position value, not
// stored here.

migrate((app) => {
  const resColl = app.findCollectionByNameOrId("residents");

  const existingNames = {};
  for (const c of app.findAllCollections()) existingNames[c.name] = true;

  if (!existingNames["barangay_personnel"]) {
    const pc = new Collection();
    pc.name = "barangay_personnel";
    pc.type = "base";
    pc.listRule = pc.viewRule = "@request.auth.id != \"\"";
    pc.createRule = pc.updateRule = "@request.auth.role = \"admin\" || @request.auth.role = \"staff\"";
    pc.deleteRule = "@request.auth.role = \"admin\"";
    for (const d of [
      { ctor: "RelationField", name: "resident_id", required: true, collectionId: resColl.id, maxSelect: 1, cascadeDelete: false },
      {
        ctor: "SelectField", name: "position", required: true, values: [
          "Chairman", "Kagawad", "SK Chairman", "SK Council",
          "Secretary", "Treasurer", "SK Secretary", "SK Treasurer",
          "Tanod", "Lupon", "Admin", "BHW", "BNS", "Street Sweeper",
        ],
      },
      { ctor: "DateField", name: "term_start", required: false },
      { ctor: "DateField", name: "term_end", required: false },
      { ctor: "SelectField", name: "status", required: true, values: ["Active", "Inactive"] },
      { ctor: "TextField", name: "remarks", required: false, max: 500 },
      { ctor: "AutodateField", name: "created", onCreate: true },
      { ctor: "AutodateField", name: "updated", onCreate: true, onUpdate: true },
    ]) pc.fields.push(makeField(d));
    app.save(pc);
    console.log("barangay_personnel created");
  } else {
    console.log("barangay_personnel: already exists");
  }
});

function makeField(def) {
  let f;
  switch (def.ctor) {
    case "TextField": f = new TextField(); f.max = def.max != null ? def.max : 255; break;
    case "NumberField": f = new NumberField(); break;
    case "BoolField": f = new BoolField(); break;
    case "SelectField": f = new SelectField(); f.values = def.values || []; break;
    case "DateField": f = new DateField(); break;
    case "EmailField": f = new EmailField(); break;
    case "JSONField": f = new JSONField(); break;
    case "RelationField":
      f = new RelationField();
      f.maxSelect = def.maxSelect != null ? def.maxSelect : 1;
      f.collectionId = def.collectionId || "";
      f.cascadeDelete = def.cascadeDelete || false;
      break;
    case "AutodateField":
      f = new AutodateField();
      f.onCreate = def.onCreate || false;
      f.onUpdate = def.onUpdate || false;
      break;
    default: f = new TextField();
  }
  f.name = def.name;
  f.required = def.required || false;
  return f;
}
