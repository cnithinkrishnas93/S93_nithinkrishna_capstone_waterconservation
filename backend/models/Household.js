import mongoose from 'mongoose'

const householdSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    householdCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    location: {
      neighborhood: {
        type: String,
        trim: true,
        maxlength: 120,
      },
      district: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },
      city: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },
    },
    residents: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Residents must be a whole number.',
      },
    },
    conservationGoalLitersPerPersonPerDay: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true },
)

const Household =
  mongoose.models.Household || mongoose.model('Household', householdSchema)

export default Household
