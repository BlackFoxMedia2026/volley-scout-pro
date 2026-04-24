-- Default attack combinations (standard DV4 codes)
-- Applied to org_id = '__defaults__' so they can be copied to any org

-- System org required by FK constraints
INSERT OR IGNORE INTO orgs (id, name, created_at) VALUES ('__defaults__', 'System Defaults', 0);

INSERT INTO attack_combinations (id, org_id, code, description, ball_type, attacker_position, sort_order) VALUES
  ('01HXDEFATK0001', '__defaults__', 'V1', 'Fast 1 (doppio)','quick','MB',1),
  ('01HXDEFATK0002', '__defaults__', 'V2', 'Fast 2','quick','MB',2),
  ('01HXDEFATK0003', '__defaults__', 'X1', 'Combinazione X1','medium','OH',3),
  ('01HXDEFATK0004', '__defaults__', 'X2', 'Combinazione X2','medium','OH',4),
  ('01HXDEFATK0005', '__defaults__', 'X5', 'Combinazione X5','medium','MB',5),
  ('01HXDEFATK0006', '__defaults__', 'X6', 'Combinazione X6','medium','MB',6),
  ('01HXDEFATK0007', '__defaults__', 'XB', 'Back row B','back_row','OP',7),
  ('01HXDEFATK0008', '__defaults__', 'XD', 'Pipe','back_row','MB',8),
  ('01HXDEFATK0009', '__defaults__', 'XP', 'Back row P','back_row','OH',9),
  ('01HXDEFATK0010', '__defaults__', 'PP', 'Parallela','high','OH',10),
  ('01HXDEFATK0011', '__defaults__', 'P1', 'Alta zona 1','high','OH',11),
  ('01HXDEFATK0012', '__defaults__', 'P2', 'Alta zona 2','high','OH',12),
  ('01HXDEFATK0013', '__defaults__', 'P5', 'Alta zona 5','high','OP',13),
  ('01HXDEFATK0014', '__defaults__', 'CF', 'Combinazione CF','medium','OH',14),
  ('01HXDEFATK0015', '__defaults__', 'CB', 'Combinazione CB','medium','OH',15);

-- Default setter calls (K codes)
INSERT INTO setter_calls (id, org_id, code, description, color_hex) VALUES
  ('01HXDEFSET0001', '__defaults__', 'K1', 'Chiamata K1','#E74C3C'),
  ('01HXDEFSET0002', '__defaults__', 'K2', 'Chiamata K2','#E67E22'),
  ('01HXDEFSET0003', '__defaults__', 'K3', 'Chiamata K3','#F1C40F'),
  ('01HXDEFSET0004', '__defaults__', 'K4', 'Chiamata K4','#2ECC71'),
  ('01HXDEFSET0005', '__defaults__', 'K5', 'Chiamata K5','#1ABC9C'),
  ('01HXDEFSET0006', '__defaults__', 'K6', 'Chiamata K6','#3498DB'),
  ('01HXDEFSET0007', '__defaults__', 'K7', 'Chiamata K7','#9B59B6'),
  ('01HXDEFSET0008', '__defaults__', 'K8', 'Chiamata K8','#34495E'),
  ('01HXDEFSET0009', '__defaults__', 'K9', 'Chiamata K9','#95A5A6');

-- Default compound code rules (serve+reception, attack+block, attack+dig)
INSERT INTO compound_code_config (id, org_id, skill_a, skill_b, quality_map, propagate_type, propagate_zones) VALUES
  ('01HXDEFCMP0001', '__defaults__', 'S', 'R',
   '{"#":"=","+":"-","-":"+","!":"!","/":"/","=":"#"}', 1, 0),
  ('01HXDEFCMP0002', '__defaults__', 'A', 'B',
   '{"#":"=","+":"-","-":"+","!":"!","/":"/","=":"#"}', 0, 0),
  ('01HXDEFCMP0003', '__defaults__', 'A', 'D',
   '{"#":"=","+":"-","-":"+","!":"!","/":"/","=":"#"}', 0, 0);
