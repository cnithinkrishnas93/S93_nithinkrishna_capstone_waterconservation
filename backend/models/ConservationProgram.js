import mongoose from 'mongoose'

const conservationProgramSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      validate: {
        validator(value) {
          return !value || !this.startDate || value >= this.startDate
        },
        message: 'The end date must be on or after the start date.',
      },
    },
    targetReductionPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ['planned', 'active', 'completed'],
      default: 'planned',
    },
    participatingHouseholds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Household',
      },
    ],
  },
  { timestamps: true },
)

conservationProgramSchema.index({ status: 1, startDate: -1 })

const ConservationProgram =
  mongoose.models.ConservationProgram ||
  mongoose.model('ConservationProgram', conservationProgramSchema)

export default ConservationProgram
