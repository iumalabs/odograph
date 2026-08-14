import { useEffect, useState } from "react";
import type { ServiceRecord } from "../service-records";
import type { VehiclePhoto, VehiclePhotoCategory } from "../vehicle-photos";
import {
  AttachmentUploadError,
  createVehiclePhoto,
  deleteVehiclePhoto,
  listVehiclePhotos,
  uploadVehiclePhotoImage,
  vehiclePhotoImageUrl,
} from "../vehicle-photos";
import { convertDistance } from "../distance";
import type { DistanceUnit } from "../distance";
import { AddIcon, CloseIcon } from "../design/icons";
import { t } from "../i18n/strings";

type PhotoGalleryPanelProps = {
  vehicleId: string;
  vehicleOdometerUnit: "km" | "mi";
  distanceUnit: DistanceUnit;
  serviceRecords: ServiceRecord[];
};

type CategoryFilter = "all" | VehiclePhotoCategory;

const CATEGORIES: VehiclePhotoCategory[] = ["general", "repair", "damage", "parts"];

function categoryLabel(category: CategoryFilter): string {
  switch (category) {
    case "all":
      return t("photoCategoryAll");
    case "general":
      return t("photoCategoryGeneral");
    case "repair":
      return t("photoCategoryRepair");
    case "damage":
      return t("photoCategoryDamage");
    case "parts":
      return t("photoCategoryParts");
  }
}

const CATEGORY_COLOR: Record<VehiclePhotoCategory, string> = {
  general: "var(--dim)",
  repair: "var(--acc2)",
  damage: "var(--warn)",
  parts: "var(--acc)",
};

const mono9 = { font: "400 9.5px var(--font-mono)", color: "var(--dim)", letterSpacing: ".08em" };

const editInputStyle = {
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "8px 10px",
  color: "var(--fg)",
  font: "500 12.5px var(--font-mono)",
  outline: "none",
};

function errorMessageFor(err: unknown): string {
  if (err instanceof AttachmentUploadError) {
    if (err.code === "file_too_large") return t("attachmentTooLargeError");
    if (err.code === "unsupported_file_type") return t("attachmentUnsupportedTypeError");
  }
  return t("genericError");
}

// New "ФОТО"/"Галерея" screen from the design mockup (Кокпит - прототип.dc.html) — a per-vehicle,
// categorized photo gallery distinct from the single vehicles.photo_r2_key cover photo shown in
// Garage.tsx. Self-contained data fetching/mutation (mirrors ServiceRecordPanel.tsx's
// service-due-estimate hint), not lifted to App.tsx like the older CRUD panels — the add flow's
// two network calls (create metadata, then attach an image) don't need App.tsx in the loop.
export function PhotoGalleryPanel(props: PhotoGalleryPanelProps) {
  const { vehicleId, vehicleOdometerUnit, distanceUnit, serviceRecords } = props;

  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formCategory, setFormCategory] = useState<VehiclePhotoCategory>("general");
  const [formCaption, setFormCaption] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formOdometer, setFormOdometer] = useState("");
  const [formServiceRecordId, setFormServiceRecordId] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    listVehiclePhotos(vehicleId).then(setPhotos).catch(() => setError(t("genericError")));
  }

  useEffect(() => {
    refresh();
    setActiveCategory("all");
    setExpandedId(null);
    setFormOpen(false);
    // Only re-runs on an actual vehicle switch — refresh() itself is stable in spirit (just
    // re-derived each render), same pattern Garage.tsx's own per-vehicle fetch effect uses.
  }, [vehicleId]);

  const counts: Record<CategoryFilter, number> = {
    all: photos.length,
    general: photos.filter((p) => p.category === "general").length,
    repair: photos.filter((p) => p.category === "repair").length,
    damage: photos.filter((p) => p.category === "damage").length,
    parts: photos.filter((p) => p.category === "parts").length,
  };

  const visible = activeCategory === "all"
    ? photos
    : photos.filter((p) => p.category === activeCategory);

  async function handleAdd() {
    setError(null);
    try {
      const photo = await createVehiclePhoto(vehicleId, {
        category: formCategory,
        caption: formCaption || undefined,
        photoDate: formDate || undefined,
        odometerReading: formOdometer !== "" ? Number(formOdometer) : undefined,
        serviceRecordId: formServiceRecordId || undefined,
      });
      if (formFile) {
        await uploadVehiclePhotoImage(photo.id, formFile);
      }
      setFormOpen(false);
      setFormCaption("");
      setFormDate("");
      setFormOdometer("");
      setFormServiceRecordId("");
      setFormFile(null);
      refresh();
    } catch (err) {
      setError(errorMessageFor(err));
    }
  }

  function handleAttachImage(photoId: string, file: File) {
    setError(null);
    uploadVehiclePhotoImage(photoId, file).then(refresh).catch((err) =>
      setError(errorMessageFor(err))
    );
  }

  function handleDelete(photoId: string) {
    setError(null);
    if (expandedId === photoId) setExpandedId(null);
    deleteVehiclePhoto(photoId).then(refresh).catch(() => setError(t("genericError")));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {(["all", ...CATEGORIES] as CategoryFilter[]).map((category) => {
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              style={{
                font: "500 10.5px var(--font-mono)",
                border: `1px solid ${isActive ? "var(--acc)" : "var(--line)"}`,
                color: isActive ? "var(--on-acc)" : "var(--dim)",
                background: isActive ? "var(--acc)" : "transparent",
                borderRadius: "var(--radius-sm)",
                padding: "6px 10px",
                cursor: "pointer",
                letterSpacing: ".04em",
              }}
            >
              {categoryLabel(category)} · {counts[category]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          style={{
            marginLeft: "auto",
            background: "var(--acc)",
            color: "var(--on-acc)",
            border: "1px solid var(--acc)",
            borderRadius: "var(--radius-md)",
            padding: "8px 12px",
            font: "600 11.5px var(--font-ui)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <AddIcon size={14} />
          {t("addPhoto")}
        </button>
      </div>

      {error && (
        <span style={{ font: "400 11px var(--font-mono)", color: "var(--warn)" }}>{error}</span>
      )}

      {formOpen && (
        <div
          style={{
            border: "1px solid var(--acc)",
            background: "var(--panel)",
            borderRadius: "var(--radius-lg)",
            padding: "16px 18px",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={mono9}>{t("photoCategoryAll")}</span>
            <select
              value={formCategory}
              onChange={(event) => setFormCategory(event.target.value as VehiclePhotoCategory)}
              style={editInputStyle}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>{categoryLabel(category)}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
            <span style={mono9}>{t("photoCaptionLabel")}</span>
            <input
              type="text"
              value={formCaption}
              onChange={(event) => setFormCaption(event.target.value)}
              style={{ ...editInputStyle, width: "100%", boxSizing: "border-box" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={mono9}>{t("photoDateLabel")}</span>
            <input
              type="date"
              value={formDate}
              onChange={(event) => setFormDate(event.target.value)}
              style={editInputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={mono9}>{t("photoOdometerLabel")}, {distanceUnit}</span>
            <input
              type="number"
              value={formOdometer}
              onChange={(event) => setFormOdometer(event.target.value)}
              style={editInputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 180px" }}>
            <span style={mono9}>{t("photoLinkServiceRecordLabel")}</span>
            <select
              value={formServiceRecordId}
              onChange={(event) => setFormServiceRecordId(event.target.value)}
              style={{ ...editInputStyle, width: "100%", boxSizing: "border-box" }}
            >
              <option value="">{t("photoLinkServiceRecordNone")}</option>
              {serviceRecords.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.serviceDate} · {record.description}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={mono9}>{t("choosePhotoFile")}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setFormFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={handleAdd}
            style={{
              background: "var(--acc)",
              color: "var(--on-acc)",
              border: "1px solid var(--acc)",
              borderRadius: "var(--radius-md)",
              padding: "9px 14px",
              font: "600 11.5px var(--font-ui)",
              cursor: "pointer",
            }}
          >
            {t("addPhoto")}
          </button>
        </div>
      )}

      {visible.length === 0
        ? (
          <div
            style={{
              border: "1px dashed var(--line)",
              borderRadius: "var(--radius-lg)",
              padding: 18,
              color: "var(--dim)",
              font: "500 12.5px var(--font-ui)",
            }}
          >
            {t("noPhotosYet")}
          </div>
        )
        : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gridAutoRows: 172,
              gap: 12,
            }}
          >
            {visible.map((photo) => {
              const expanded = expandedId === photo.id;
              const linkedRecord = photo.serviceRecordId
                ? serviceRecords.find((record) => record.id === photo.serviceRecordId)
                : undefined;
              const displayOdometer = photo.odometerReading != null
                ? Math.round(
                  convertDistance(photo.odometerReading, vehicleOdometerUnit, distanceUnit),
                )
                : null;

              // A CSS Grid item's automatic min-height is content-based (an <img> with
              // object-fit:contain reports its own intrinsic size upward through this component's
              // nested flex/grid wrappers), so gridAutoRows:172 alone doesn't reliably cap tile
              // height even with overflow:hidden set — confirmed live via a Playwright screenshot
              // showing a "collapsed" tile rendering 567px tall. Pinning an explicit pixel height
              // on the grid item itself removes the ambiguity outright.
              const tileHeight = expanded ? 172 * 2 + 12 : 172;

              return (
                <div
                  key={photo.id}
                  style={{
                    gridColumn: expanded ? "span 2" : undefined,
                    gridRow: expanded ? "span 2" : undefined,
                    height: tileHeight,
                    position: "relative",
                    border: "1px solid var(--line)",
                    background: "var(--panel)",
                    borderRadius: "var(--radius-lg)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    onClick={() => photo.hasImage && setExpandedId(expanded ? null : photo.id)}
                    style={{
                      position: "relative",
                      flex: 1,
                      minHeight: 0,
                      overflow: "hidden",
                      background: "var(--panel2)",
                      display: "grid",
                      placeItems: "center",
                      cursor: photo.hasImage ? "pointer" : undefined,
                    }}
                  >
                    {photo.hasImage
                      ? (
                        <img
                          src={vehiclePhotoImageUrl(photo.id)}
                          alt={photo.caption ?? categoryLabel(photo.category)}
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                      )
                      : (
                        <label
                          style={{
                            cursor: "pointer",
                            font: "400 10.5px var(--font-mono)",
                            color: "var(--dim)",
                            textAlign: "center",
                            padding: 8,
                          }}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) handleAttachImage(photo.id, file);
                            }}
                          />
                          {t("photoEmptyTileHint")}
                        </label>
                      )}
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        font: "500 9.5px var(--font-mono)",
                        color: CATEGORY_COLOR[photo.category],
                        background: "rgba(10,12,15,.75)",
                        borderRadius: "var(--radius-sm)",
                        padding: "3px 7px",
                        letterSpacing: ".04em",
                      }}
                    >
                      {categoryLabel(photo.category)}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(photo.id);
                      }}
                      title={t("deletePhoto")}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        width: 22,
                        height: 22,
                        display: "grid",
                        placeItems: "center",
                        background: "rgba(10,12,15,.75)",
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--dim)",
                        cursor: "pointer",
                      }}
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                  <div
                    style={{
                      padding: "8px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {photo.caption && (
                      <span style={{ font: "600 11px var(--font-ui)" }}>{photo.caption}</span>
                    )}
                    <span style={{ font: "400 9.5px var(--font-mono)", color: "var(--dim)" }}>
                      {[
                        photo.photoDate,
                        displayOdometer != null ? `${displayOdometer} ${distanceUnit}` : null,
                      ].filter(Boolean).join(" · ")}
                      {linkedRecord && (
                        <span style={{ color: "var(--acc2)" }}>
                          {" · "}
                          {linkedRecord.description}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
