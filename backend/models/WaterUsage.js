import mongoose from 'mongoose'

const waterUsageSchema = new mongoose.Schema(
  {
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: true,
    },
    recordedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    consumptionLiters: {
      type: Number,
      required: true,
      min: 0,
    },
    meterReadingLiters: {
      type: Number,
      min: 0,
    },
    source: {
      type: String,
      enum: ['manual', 'meter', 'import'],
      default: 'manual',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true },
)

waterUsageSchema.index({ household: 1, recordedAt: -1 })

const WaterUsage =
  mongoose.models.WaterUsage || mongoose.model('WaterUsage', waterUsageSchema)

export default WaterUsage
