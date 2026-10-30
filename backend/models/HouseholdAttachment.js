import mongoose from 'mongoose'

const householdAttachmentSchema = new mongoose.Schema(
  {
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      maxlength: 120,
    },
    mimeType: {
      type: String,
      required: true,
      enum: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    },
    size: {
      type: Number,
      required: true,
      min: 1,
      max: 5 * 1024 * 1024,
    },
    data: {
      type: Buffer,
      required: true,
    },
    uploadedBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
)

const HouseholdAttachment =
  mongoose.models.HouseholdAttachment
  || mongoose.model('HouseholdAttachment', householdAttachmentSchema)

export default HouseholdAttachment
