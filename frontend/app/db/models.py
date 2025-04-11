from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.ext.automap import automap_base
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime

# Create base metadata
metadata = MetaData()
Base = declarative_base(metadata=metadata)


# This is a fallback generic model for when we don't have an exact schema match
class GenericDataTable(Base):
    __tablename__ = "data_table"

    id = Column(Integer, primary_key=True, index=True)

    # Since we have a large number of columns, we'll use a JSONB field as a fallback
    # This allows us to store data even if we don't know the exact schema
    data = Column(JSONB, nullable=True)
    metadata = Column(JSONB, nullable=True)

    # Add metadata columns for tracking
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<GenericDataTable(id={self.id})>"

    # Helper method to convert to dict
    def to_dict(self):
        result = {column.name: getattr(self, column.name)
                  for column in self.__table__.columns}

        # Expand the JSONB data field if present
        if self.data and isinstance(self.data, dict):
            for key, value in self.data.items():
                result[key] = value

        return result


# We'll use automap to dynamically map database tables to models
# This will be done at runtime in database.py
AutomapBase = automap_base()


# Override reflected table model creation to add convenience methods
@classmethod
def _model_customize(cls, name, referred_table, model):
    # Add custom methods to each mapped class

    # Add to_dict method
    def to_dict(self):
        return {column.name: getattr(self, column.name)
                for column in self.__table__.columns}

    model.to_dict = to_dict

    # Add any other custom methods here
    return model


# Set customization callback
AutomapBase._model_customize = _model_customize