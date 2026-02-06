-- Migration: 105_final_zone_corridors
-- Priority: P0 - FINALIZE ZONE NAMES WITH "ROUTE CORRIDOR" FORMAT
-- 
-- Final approved 5 zones using "Name | Start ⇄ End" format
-- This is the LOCKED configuration - do not modify without approval

-- ============================================================================
-- STEP 1: Check if zones table exists, create if not
-- ============================================================================

CREATE TABLE IF NOT EXISTS zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    color_hex TEXT DEFAULT '#6B7280',
    list_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 2: Clear old zones to avoid confusion
-- ============================================================================

DELETE FROM zones;

-- ============================================================================
-- STEP 3: Insert the 5 Final Route Corridors
-- ============================================================================

INSERT INTO zones (name, code, description, color_hex, list_order) VALUES 
    -- Blue - North Corridor
    (
        'NORTH | Swayambhu ⇄ Chabahil', 
        'NORTH', 
        'Swayambhu, Halchowk, Balaju, Gongabu, Samakhushi, Maharajgunj, Budhanilkantha, Tokha, Chabahil', 
        '#3B82F6', 
        1
    ),
    
    -- Purple - West Corridor
    (
        'WEST | Kalanki ⇄ Kirtipur', 
        'WEST', 
        'Kalanki, Sita Paila, Naikap, Thankot, Satungal, Balkhu, Kirtipur, Chobhar', 
        '#8B5CF6', 
        2
    ),
    
    -- Orange - Center Corridor
    (
        'CENTER | Newroad ⇄ Baneshwor', 
        'CENTER', 
        'Chettrapati, Thamel, Asan, New Road, Tripureshwor, Putalisadak, Lazimpat, Kamaladi, Maitidevi, Baneshwor', 
        '#F59E0B', 
        3
    ),
    
    -- Green - East Corridor
    (
        'EAST | Tinkune ⇄ Bhaktapur', 
        'EAST', 
        'Tinkune, Koteshwor, Sinamangal, Pepsicola, Thimi, Bhaktapur, Suryabinayak', 
        '#10B981', 
        4
    ),
    
    -- Red - Lalitpur Corridor
    (
        'LALITPUR | Patan ⇄ Bhaisepati', 
        'LALIT', 
        'Kupondole, Sanepa, Jhamsikhel, Jawalakhel, Lagankhel, Satdobato, Bhaisepati, Godawari', 
        '#EF4444', 
        5
    );

-- ============================================================================
-- STEP 4: Create zone_areas junction table for detailed area mapping
-- ============================================================================

CREATE TABLE IF NOT EXISTS zone_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    area_name TEXT NOT NULL,
    list_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(zone_id, area_name)
);

-- Clear existing area mappings
DELETE FROM zone_areas;

-- Insert detailed area mappings for each zone
DO $$
DECLARE
    v_north_id UUID;
    v_west_id UUID;
    v_center_id UUID;
    v_east_id UUID;
    v_lalit_id UUID;
BEGIN
    -- Get zone IDs
    SELECT id INTO v_north_id FROM zones WHERE code = 'NORTH';
    SELECT id INTO v_west_id FROM zones WHERE code = 'WEST';
    SELECT id INTO v_center_id FROM zones WHERE code = 'CENTER';
    SELECT id INTO v_east_id FROM zones WHERE code = 'EAST';
    SELECT id INTO v_lalit_id FROM zones WHERE code = 'LALIT';
    
    -- NORTH areas
    INSERT INTO zone_areas (zone_id, area_name, list_order) VALUES
        (v_north_id, 'Swayambhu', 1),
        (v_north_id, 'Halchowk', 2),
        (v_north_id, 'Balaju', 3),
        (v_north_id, 'Gongabu', 4),
        (v_north_id, 'Samakhushi', 5),
        (v_north_id, 'Maharajgunj', 6),
        (v_north_id, 'Budhanilkantha', 7),
        (v_north_id, 'Tokha', 8),
        (v_north_id, 'Chabahil', 9);
    
    -- WEST areas
    INSERT INTO zone_areas (zone_id, area_name, list_order) VALUES
        (v_west_id, 'Kalanki', 1),
        (v_west_id, 'Sita Paila', 2),
        (v_west_id, 'Naikap', 3),
        (v_west_id, 'Thankot', 4),
        (v_west_id, 'Satungal', 5),
        (v_west_id, 'Balkhu', 6),
        (v_west_id, 'Kirtipur', 7),
        (v_west_id, 'Chobhar', 8);
    
    -- CENTER areas
    INSERT INTO zone_areas (zone_id, area_name, list_order) VALUES
        (v_center_id, 'Chettrapati', 1),
        (v_center_id, 'Thamel', 2),
        (v_center_id, 'Asan', 3),
        (v_center_id, 'New Road', 4),
        (v_center_id, 'Tripureshwor', 5),
        (v_center_id, 'Putalisadak', 6),
        (v_center_id, 'Lazimpat', 7),
        (v_center_id, 'Kamaladi', 8),
        (v_center_id, 'Maitidevi', 9),
        (v_center_id, 'Baneshwor', 10);
    
    -- EAST areas
    INSERT INTO zone_areas (zone_id, area_name, list_order) VALUES
        (v_east_id, 'Tinkune', 1),
        (v_east_id, 'Koteshwor', 2),
        (v_east_id, 'Sinamangal', 3),
        (v_east_id, 'Pepsicola', 4),
        (v_east_id, 'Thimi', 5),
        (v_east_id, 'Bhaktapur', 6),
        (v_east_id, 'Suryabinayak', 7);
    
    -- LALITPUR areas
    INSERT INTO zone_areas (zone_id, area_name, list_order) VALUES
        (v_lalit_id, 'Kupondole', 1),
        (v_lalit_id, 'Sanepa', 2),
        (v_lalit_id, 'Jhamsikhel', 3),
        (v_lalit_id, 'Jawalakhel', 4),
        (v_lalit_id, 'Lagankhel', 5),
        (v_lalit_id, 'Satdobato', 6),
        (v_lalit_id, 'Bhaisepati', 7),
        (v_lalit_id, 'Godawari', 8);
    
    RAISE NOTICE '[OK] Zone areas populated';
END $$;

-- ============================================================================
-- STEP 5: Create RPC to get zones with areas
-- ============================================================================

CREATE OR REPLACE FUNCTION get_zones_with_areas()
RETURNS TABLE (
    id UUID,
    name TEXT,
    code TEXT,
    description TEXT,
    color_hex TEXT,
    list_order INTEGER,
    areas TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        z.id,
        z.name,
        z.code,
        z.description,
        z.color_hex,
        z.list_order,
        COALESCE(
            ARRAY_AGG(za.area_name ORDER BY za.list_order) 
            FILTER (WHERE za.area_name IS NOT NULL),
            ARRAY[]::TEXT[]
        ) as areas
    FROM zones z
    LEFT JOIN zone_areas za ON za.zone_id = z.id
    WHERE z.is_active = TRUE
    GROUP BY z.id, z.name, z.code, z.description, z.color_hex, z.list_order
    ORDER BY z.list_order;
END;
$$;

-- ============================================================================
-- STEP 6: Grant permissions
-- ============================================================================

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE zone_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_read_zones ON zones;
DROP POLICY IF EXISTS authenticated_read_zone_areas ON zone_areas;

CREATE POLICY authenticated_read_zones ON zones FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_zone_areas ON zone_areas FOR SELECT TO authenticated USING (true);

GRANT EXECUTE ON FUNCTION get_zones_with_areas TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_zone_count INT;
    v_area_count INT;
BEGIN
    SELECT COUNT(*) INTO v_zone_count FROM zones;
    SELECT COUNT(*) INTO v_area_count FROM zone_areas;
    
    RAISE NOTICE '[OK] Migration 105 complete: % zones, % areas configured', v_zone_count, v_area_count;
END $$;
